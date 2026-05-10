using System.Diagnostics;

namespace StreamApp.Services;

public class FfmpegStreamer : BackgroundService
{
    private readonly StreamBroadcaster _broadcaster;
    private readonly ILogger<FfmpegStreamer> _log;

    public FfmpegStreamer(StreamBroadcaster broadcaster, ILogger<FfmpegStreamer> log)
    {
        _broadcaster = broadcaster;
        _log = log;
    }

    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Запускаем ffmpeg, слушающий mpegts по TCP от OBS,
        // и перекодирующий поток в fragmented mp4 (для MSE в браузере) на stdout.
        var psi = new ProcessStartInfo
        {
            FileName = "ffmpeg",
            Arguments = "-loglevel error " +
                        "-listen 1 -i rtmp://0.0.0.0:1935/live/stream " +
                        "-fflags nobuffer -flags low_delay " +
                        "-c:v copy -c:a aac -ar 44100 -ac 1 " +
                        "-f mp4 -movflags +frag_keyframe+empty_moov+default_base_moof " +
                        "-frag_duration 500000 " +
                        "pipe:1",
            RedirectStandardOutput = true,
            RedirectStandardError  = true,
            UseShellExecute = false
        };

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                _broadcaster.Reset();
                using var proc = Process.Start(psi)!;
                _log.LogInformation("ffmpeg started, listening rtmp://localhost:1935 for OBS");

                _ = Task.Run(async () =>
                {
                    using var er = proc.StandardError;
                    string? line;
                    while ((line = await er.ReadLineAsync()) != null)
                        _log.LogWarning("ffmpeg: {line}", line);
                });

                var stdout = proc.StandardOutput.BaseStream;
                var buffer = new byte[16 * 1024];
                int read;
                while ((read = await stdout.ReadAsync(buffer, stoppingToken)) > 0)
                {
                    await _broadcaster.BroadcastAsync(buffer, read);
                }
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "ffmpeg crashed, restart in 2s");
            }
            await Task.Delay(2000, stoppingToken);
        }
    }
}
