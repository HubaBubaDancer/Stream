using StreamApp.Hubs;
using StreamApp.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSignalR();
builder.Services.AddSingleton<StreamBroadcaster>();
builder.Services.AddHostedService<FfmpegStreamer>();

// CORS — чтобы фронт с любого порта мог стучаться (для лабы хватит)
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.AllowAnyHeader().AllowAnyMethod().SetIsOriginAllowed(_ => true).AllowCredentials()));

var app = builder.Build();

app.UseCors();
app.UseWebSockets(new WebSocketOptions
{
    KeepAliveInterval = TimeSpan.FromSeconds(15)
});

// SignalR-хаб для чата
app.MapHub<ChatHub>("/chat");

// Сырой WebSocket для видео
app.Map("/stream", async (HttpContext ctx, StreamBroadcaster broadcaster) =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    await broadcaster.HandleClientAsync(ws, ctx.RequestAborted);
});

app.MapGet("/", () => "StreamApp is running. /chat (SignalR), /stream (WS video), /health");
app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.Run("http://0.0.0.0:5000");