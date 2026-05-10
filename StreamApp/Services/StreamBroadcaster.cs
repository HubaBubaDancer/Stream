using System.Collections.Concurrent;
using System.Net.WebSockets;

namespace StreamApp.Services;

public class StreamBroadcaster
{
    private readonly ConcurrentDictionary<Guid, WebSocket> _clients = new();
    
    // Кэш инит-сегмента (ftyp + moov)
    private byte[]? _initSegment;
    private bool _initComplete;
    

    public void Reset()
    {
        _initSegment = null;
        _initComplete = false;
    
        // Закрываем все соединения чтобы фронт получил onclose
        foreach (var (id, ws) in _clients)
        {
            _clients.TryRemove(id, out _);
            if (ws.State == WebSocketState.Open)
                _ = ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "stream stopped", CancellationToken.None);
        }
    }
    
    // Вызывается из FfmpegStreamer для каждого чанка
    public async Task BroadcastAsync(byte[] chunk, int length)
    {
        if (!_initComplete)
        {
            var span = new ReadOnlySpan<byte>(chunk, 0, length);
            int moofIndex = IndexOf(span, "moof"u8);

            Console.WriteLine($"init collecting, moofIndex={moofIndex}, length={length}, initSize={_initSegment?.Length ?? 0}");

            if (moofIndex <= 4)
            {
                // moof в самом начале чанка — весь init уже собран в предыдущих чанках
                _initComplete = true;
                Console.WriteLine($"init complete, size={_initSegment?.Length}");
            }
            else
            {
                // часть этого чанка ещё относится к init
                AppendInit(chunk, moofIndex - 4);
                _initComplete = true;
                Console.WriteLine($"init complete, size={_initSegment?.Length}");
            }
        }

        await SendToAll(chunk, length);
    }

    private void AppendInit(byte[] data, int length)
    {
        if (length <= 0) return;
        var prev = _initSegment ?? Array.Empty<byte>();
        var next = new byte[prev.Length + length];
        prev.CopyTo(next, 0);
        Array.Copy(data, 0, next, prev.Length, length);
        _initSegment = next;
    }

    private static int IndexOf(ReadOnlySpan<byte> haystack, ReadOnlySpan<byte> needle)
    {
        for (int i = 0; i <= haystack.Length - needle.Length; i++)
            if (haystack.Slice(i, needle.Length).SequenceEqual(needle))
                return i;
        return -1;
    }

    public async Task HandleClientAsync(WebSocket ws, CancellationToken ct)
    {
        var id = Guid.NewGuid();
        _clients[id] = ws;

        // Сразу отправляем init segment новому клиенту
        if (_initSegment is { Length: > 0 })
        {
            try
            {
                await ws.SendAsync(_initSegment, WebSocketMessageType.Binary,
                    endOfMessage: true, CancellationToken.None);
            }
            catch { /* клиент отвалился до старта */ }
        }

        try
        {
            var buffer = new byte[1024];
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var res = await ws.ReceiveAsync(buffer, ct);
                if (res.MessageType == WebSocketMessageType.Close) break;
            }
        }
        catch
        {
            Console.WriteLine("errrrrrror");
        }
        finally
        {
            _clients.TryRemove(id, out _);
            if (ws.State == WebSocketState.Open)
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
        }
    }

    private async Task SendToAll(byte[] chunk, int length)
    {
        foreach (var (id, ws) in _clients)
        {
            if (ws.State != WebSocketState.Open) { _clients.TryRemove(id, out _); continue; }
            try
            {
                await ws.SendAsync(new ArraySegment<byte>(chunk, 0, length),
                    WebSocketMessageType.Binary, endOfMessage: true, CancellationToken.None);
            }
            catch { _clients.TryRemove(id, out _); }
        }
    }

    public int ClientCount => _clients.Count;
}