import { useEffect, useRef, useState, useCallback } from "react";

type ConnectionStatus = "connecting" | "live" | "disconnected";

const WS_URL = "ws://192.168.31.11:5000";

export default function VideoPlayer() {
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaSourceRef = useRef<MediaSource | null>(null);
    const sourceBufferRef = useRef<SourceBuffer | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const chunkQueueRef = useRef<ArrayBuffer[]>([]);
    const reconnectTimeoutRef = useRef<number | null>(null);
    // флаг чтобы не запускать реконнект если компонент размонтирован
    const isMountedRef = useRef(true);

    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [hasData, setHasData] = useState(false);

    // Полная очистка текущей сессии
    const cleanup = useCallback(() => {
        // 1. Закрываем сокет
        const ws = socketRef.current;
        if (ws) {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onclose = null;
            ws.onerror = null;
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.close();
            }
            socketRef.current = null;
        }

        // 2. Убираем SourceBuffer
        sourceBufferRef.current = null;

        // 3. Закрываем MediaSource
        const ms = mediaSourceRef.current;
        if (ms && ms.readyState === "open") {
            try { ms.endOfStream(); } catch { /* ignore */ }
        }
        mediaSourceRef.current = null;

        // 4. Сбрасываем очередь
        chunkQueueRef.current = [];
    }, []);

    const processQueue = useCallback(() => {
        const sb = sourceBufferRef.current;
        const ms = mediaSourceRef.current;
        if (!sb || sb.updating || chunkQueueRef.current.length === 0) return;
        if (!ms || ms.readyState !== "open") return;

        const chunk = chunkQueueRef.current.shift();
        if (chunk) {
            try {
                sb.appendBuffer(chunk);
            } catch (error) {
                console.error("[stream] appendBuffer error:", error);
                // Буфер испорчен — форсируем реконнект
                chunkQueueRef.current = [];
            }
        }
    }, []);

    const connect = useCallback(() => {
        if (!isMountedRef.current) return;

        cleanup();
        setStatus("connecting");
        setHasData(false);

        const mediaSource = new MediaSource();
        mediaSourceRef.current = mediaSource;

        if (videoRef.current) {
            // Освобождаем старый object URL
            if (videoRef.current.src) {
                URL.revokeObjectURL(videoRef.current.src);
            }
            videoRef.current.src = URL.createObjectURL(mediaSource);
        }

        mediaSource.addEventListener("sourceopen", () => {
            // Проверяем что это актуальный MediaSource (не из старой сессии)
            if (mediaSourceRef.current !== mediaSource) return;

            let sourceBuffer: SourceBuffer;
            try {
                sourceBuffer = mediaSource.addSourceBuffer(
                    'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'
                );
            } catch (e) {
                console.error("[stream] addSourceBuffer failed:", e);
                setStatus("disconnected");
                return;
            }

            sourceBufferRef.current = sourceBuffer;
            sourceBuffer.addEventListener("updateend", processQueue);

            // Открываем WebSocket только после готовности MediaSource
            const socket = new WebSocket(`${WS_URL}/stream`);
            socket.binaryType = "arraybuffer";
            socketRef.current = socket;

            socket.onopen = () => {
                console.log("[stream] WebSocket connected ✅");
            };

            socket.onmessage = (event) => {
                // Проверяем что сокет и буфер всё ещё актуальны
                if (socketRef.current !== socket) return;
                if (!sourceBufferRef.current) return;

                setHasData(true);
                setStatus("live");

                chunkQueueRef.current.push(event.data as ArrayBuffer);
                processQueue();
            };

            socket.onclose = () => {
                console.log("[stream] WebSocket closed");
                if (!isMountedRef.current) return;
                if (socketRef.current !== socket) return; // уже переподключились
                setStatus("disconnected");
                scheduleReconnect();
            };

            socket.onerror = () => {
                if (socketRef.current !== socket) return;
                setStatus("disconnected");
            };
        }, { once: true });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cleanup, processQueue]);

    const scheduleReconnect = useCallback(() => {
        if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = window.setTimeout(() => {
            if (!isMountedRef.current) return;
            console.log("[stream] Reconnecting...");
            connect();
        }, 3000);
    }, [connect]);

    useEffect(() => {
        isMountedRef.current = true;
        connect();

        return () => {
            isMountedRef.current = false;
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="relative h-full w-full flex items-center justify-center bg-black">
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-contain"
            />

            <div className="absolute top-4 left-4">
                <StatusBadge status={status} />
            </div>

            {!hasData && status !== "disconnected" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-10 w-10 border-2 border-white border-t-transparent mx-auto mb-4" />
                        <p className="text-gray-400">Waiting for stream...</p>
                    </div>
                </div>
            )}

            {status === "disconnected" && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                    <div className="text-center">
                        <p className="text-red-400 mb-2">Disconnected</p>
                        <p className="text-gray-500 text-sm">Reconnecting in 3 seconds...</p>
                    </div>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: ConnectionStatus }) {
    const config = {
        connecting: { label: "Connecting", dotColor: "bg-yellow-500", pulse: true },
        live:        { label: "Live",       dotColor: "bg-green-500",  pulse: true },
        disconnected:{ label: "Disconnected",dotColor: "bg-red-500",  pulse: false },
    }[status];

    return (
        <div className="flex items-center gap-2 bg-black/70 px-3 py-1.5 rounded-full">
      <span className="relative flex h-2.5 w-2.5">
        {config.pulse && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${config.dotColor} opacity-75`} />
        )}
          <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${config.dotColor}`} />
      </span>
            <span className="text-sm font-medium text-white">{config.label}</span>
        </div>
    );
}