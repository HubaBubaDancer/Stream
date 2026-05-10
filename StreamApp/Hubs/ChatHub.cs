using Microsoft.AspNetCore.SignalR;

namespace StreamApp.Hubs;

public class ChatHub : Hub
{
    public async Task SendMessage(string user, string message)
    {
        await Clients.All.SendAsync("ReceiveMessage", user, message, DateTime.UtcNow);
    }

    public override async Task OnConnectedAsync()
    {
        await Clients.All.SendAsync("ReceiveMessage", "system",
            $"User {Context.ConnectionId[..6]} joined", DateTime.UtcNow);
        await base.OnConnectedAsync();
    }
}