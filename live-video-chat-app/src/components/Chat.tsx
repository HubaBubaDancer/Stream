import { useEffect, useRef, useState, useCallback } from "react";
import * as signalR from "@microsoft/signalr";
import { Send } from "lucide-react";

type ConnectionStatus = "connected" | "reconnecting" | "disconnected";

interface ChatMessage {
  id: string;
  user: string;
  message: string;
  timestamp: string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";
const USERNAME_KEY = "stream-chat-username";

export default function Chat() {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [username, setUsername] = useState(() => {
    return localStorage.getItem(USERNAME_KEY) || "";
  });
  const [showUsernameModal, setShowUsernameModal] = useState(!username);
  const [usernameInput, setUsernameInput] = useState("");

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const connect = useCallback(() => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      return;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_URL}/chat`, {
        skipNegotiation: false,
        withCredentials: true,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Information)
      .build();

    connectionRef.current = connection;

    connection.on("receiveMessage", (user: string, message: string, timestamp: string) => {
      const newMessage: ChatMessage = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        user,
        message,
        timestamp,
      };
      setMessages((prev) => [...prev, newMessage]);
    });

    connection.onreconnecting(() => {
      console.log("[v0] SignalR reconnecting...");
      setStatus("reconnecting");
    });

    connection.onreconnected(() => {
      console.log("[v0] SignalR reconnected");
      setStatus("connected");
    });

    connection.onclose(() => {
      console.log("[v0] SignalR connection closed");
      setStatus("disconnected");
    });

    connection
      .start()
      .then(() => {
        console.log("[v0] SignalR connected");
        setStatus("connected");
      })
      .catch((error) => {
        console.error("[v0] SignalR connection error:", error);
        setStatus("disconnected");
      });
  }, []);

  useEffect(() => {
    connect();

    return () => {
      connectionRef.current?.stop();
    };
  }, [connect]);

  const sendMessage = async () => {
    if (!inputMessage.trim() || !username || status !== "connected") {
      return;
    }

    try {
      await connectionRef.current?.invoke("sendMessage", username, inputMessage.trim());
      setInputMessage("");
    } catch (error) {
      console.error("[v0] Error sending message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSetUsername = () => {
    if (usernameInput.trim()) {
      const name = usernameInput.trim();
      setUsername(name);
      localStorage.setItem(USERNAME_KEY, name);
      setShowUsernameModal(false);
    }
  };

  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    } catch {
      return timestamp;
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2a2a]">
        <h2 className="font-semibold text-lg">Live Chat</h2>
        <ConnectionStatusBadge status={status} />
      </div>

      {/* Username display */}
      {username && (
        <div className="px-4 py-2 border-b border-[#2a2a2a] bg-[#151515]">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              Chatting as <span className="text-white font-medium">{username}</span>
            </span>
            <button
              onClick={() => setShowUsernameModal(true)}
              className="text-xs text-blue-400 hover:text-blue-300"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 chat-messages">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            <p>No messages yet</p>
            <p className="text-sm mt-1">Be the first to say hello!</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} formatTime={formatTime} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-[#2a2a2a]">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={username ? "Type a message..." : "Set username first..."}
            disabled={!username || status !== "connected"}
            className="flex-1 bg-[#252525] border border-[#333] rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || !username || status !== "connected"}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
          >
            <Send size={18} />
          </button>
        </div>
      </div>

      {/* Username Modal */}
      {showUsernameModal && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-[#1a1a1a] rounded-lg p-6 w-[90%] max-w-sm border border-[#2a2a2a]">
            <h3 className="text-lg font-semibold mb-4">Enter your username</h3>
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetUsername()}
              placeholder="Your display name"
              autoFocus
              className="w-full bg-[#252525] border border-[#333] rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
            />
            <div className="flex gap-2">
              {username && (
                <button
                  onClick={() => setShowUsernameModal(false)}
                  className="flex-1 bg-[#333] hover:bg-[#444] px-4 py-2 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSetUsername}
                disabled={!usernameInput.trim()}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed px-4 py-2 rounded-lg transition-colors"
              >
                {username ? "Update" : "Join Chat"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  formatTime,
}: {
  message: ChatMessage;
  formatTime: (timestamp: string) => string;
}) {
  const isSystem = message.user === "system";

  if (isSystem) {
    return (
      <div className="text-center">
        <span className="text-gray-500 text-sm italic">{message.message}</span>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-baseline gap-2">
        <span className="font-medium text-blue-400 text-sm">{message.user}</span>
        <span className="text-gray-600 text-xs">{formatTime(message.timestamp)}</span>
      </div>
      <p className="text-gray-200 text-sm mt-0.5 break-words">{message.message}</p>
    </div>
  );
}

function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const config = {
    connected: {
      label: "Connected",
      color: "text-green-400",
      bgColor: "bg-green-400/10",
    },
    reconnecting: {
      label: "Reconnecting",
      color: "text-yellow-400",
      bgColor: "bg-yellow-400/10",
    },
    disconnected: {
      label: "Disconnected",
      color: "text-red-400",
      bgColor: "bg-red-400/10",
    },
  };

  const c = config[status];

  return (
    <span className={`text-xs px-2 py-1 rounded-full ${c.color} ${c.bgColor}`}>
      {c.label}
    </span>
  );
}
