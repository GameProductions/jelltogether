using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Text.Json;

namespace JellyParty.Plugin.Services
{
    public class JellyPartyRoom
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string RoomCode { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public bool IsPrivate { get; set; } = false;
        public bool AllowParticipantInvites { get; set; } = true;
        public string OwnerId { get; set; } = string.Empty;
        public List<string> CoHostIds { get; set; } = new();
        public List<string> Participants { get; set; } = new();
        public Dictionary<string, int> CinemaSeats { get; set; } = new(); // UserId -> SeatIndex
        public List<JellyPartyInvite> Invitations { get; set; } = new();
        public List<QueueItem> Queue { get; set; } = new();
        public List<TheoryNote> Theories { get; set; } = new();
        public List<TriviaQuestion> Trivia { get; set; } = new();
        public RoomStats Stats { get; set; } = new();
        public List<string> BufferingUserIds { get; set; } = new();
        public Dictionary<string, ParticipantPermissions> Permissions { get; set; } = new();
        public List<ChatMessage> Messages { get; set; } = new();
        public string? LastMessagePreview { get; set; }
        public List<Poll> ActivePolls { get; set; } = new();
        public string CurrentTheme { get; set; } = "default";
        public bool IsHostOnlyControl { get; set; } = false;
        public string? DiscordWebhookUrl { get; set; }
        public string? DiscordBotToken { get; set; }
        public string? DiscordStageId { get; set; }
        public List<string> RecentReactions { get; set; } = new();
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }

    public class QueueItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Title { get; set; } = string.Empty;
        public string MediaId { get; set; } = string.Empty;
        public List<string> Upvotes { get; set; } = new();
        public string AddedBy { get; set; } = string.Empty;
    }

    public class TheoryNote
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Text { get; set; } = string.Empty;
        public string Author { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class TriviaQuestion
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Question { get; set; } = string.Empty;
        public List<string> Options { get; set; } = new();
        public int CorrectIndex { get; set; }
        public Dictionary<string, int> Scores { get; set; } = new();
        public bool IsActive { get; set; } = true;
    }

    public class RoomStats
    {
        public int TotalReactions { get; set; }
        public int TotalMessages { get; set; }
        public string? TopReactor { get; set; }
        public string? TopChatter { get; set; }
    }

    public class JellyPartyInvite
    {
        public string Code { get; set; } = string.Empty;
        public ParticipantPermissions DefaultPermissions { get; set; } = new();
        public DateTime? ExpiresAt { get; set; }
        public int MaxUses { get; set; } = 0; // 0 = Unlimited
        public int CurrentUses { get; set; } = 0;
        public string CreatedBy { get; set; } = string.Empty;
    }

    public class Poll
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Question { get; set; } = string.Empty;
        public List<string> Options { get; set; } = new();
        public Dictionary<string, List<string>> Votes { get; set; } = new();
        public bool IsClosed { get; set; } = false;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }

    public class ParticipantPermissions
    {
        public bool CanChat { get; set; } = true;
        public bool CanControlPlayback { get; set; } = true;
    }

    public class ChatMessage
    {
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class RoomManager
    {
        private readonly ConcurrentDictionary<string, JellyPartyRoom> _rooms = new();
        private readonly string _storagePath;
        private readonly object _fileLock = new();
        private static readonly HttpClient _httpClient = new();
        private DateTime _lastSave = DateTime.MinValue;

        public RoomManager(string configPath)
        {
            _storagePath = Path.Combine(configPath, "rooms.json");
            LoadRooms();
        }

        private void SaveRooms(bool force = false)
        {
            // Throttle saves to once every 5 seconds unless forced
            if (!force && (DateTime.UtcNow - _lastSave).TotalSeconds < 5) return;

            lock (_fileLock)
            {
                try
                {
                    var json = JsonSerializer.Serialize(_rooms.Values, new JsonSerializerOptions { WriteIndented = true });
                    File.WriteAllText(_storagePath, json);
                    _lastSave = DateTime.UtcNow;
                }
                catch { }
            }
        }

        private void LoadRooms()
        {
            lock (_fileLock)
            {
                try
                {
                    if (File.Exists(_storagePath))
                    {
                        var json = File.ReadAllText(_storagePath);
                        var rooms = JsonSerializer.Deserialize<List<JellyPartyRoom>>(json);
                        if (rooms != null)
                        {
                            foreach (var room in rooms) _rooms[room.Id] = room;
                        }
                    }
                }
                catch { }
            }
        }

        public JellyPartyRoom CreateRoom(string name, string ownerId)
        {
            var room = new JellyPartyRoom 
            { 
                Name = name, 
                OwnerId = ownerId,
                RoomCode = GenerateRoomCode()
            };
            room.Participants.Add(ownerId);
            room.Permissions[ownerId] = new ParticipantPermissions();
            _rooms[room.Id] = room;
            SaveRooms();
            return room;
        }

        private string GenerateRoomCode()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            var random = new Random();
            return new string(Enumerable.Repeat(chars, 6)
                .Select(s => s[random.Next(s.Length)]).ToArray());
        }

        public void TogglePrivacy(string roomId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.IsPrivate = !room.IsPrivate;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public JellyPartyRoom? GetRoom(string roomId)
        {
            return _rooms.TryGetValue(roomId, out var room) ? room : null;
        }

        public JellyPartyInvite CreateInvite(string roomId, string creatorId, ParticipantPermissions perms, int hoursValid = 24, int maxUses = 0)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                var invite = new JellyPartyInvite
                {
                    Code = GenerateRoomCode(),
                    CreatedBy = creatorId,
                    DefaultPermissions = perms,
                    ExpiresAt = hoursValid > 0 ? DateTime.UtcNow.AddHours(hoursValid) : null,
                    MaxUses = maxUses
                };
                room.Invitations.Add(invite);
                SaveRooms();
                return invite;
            }
            throw new Exception("Room not found");
        }

        public void ToggleParticipantInvites(string roomId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.AllowParticipantInvites = !room.AllowParticipantInvites;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void JoinRoom(string roomId, string userId, string? inviteCode = null)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (!room.Participants.Contains(userId))
                {
                    room.Participants.Add(userId);
                    
                    // Apply specific permissions from invite if provided
                    var perms = new ParticipantPermissions();
                    if (!string.IsNullOrEmpty(inviteCode))
                    {
                        var invite = room.Invitations.FirstOrDefault(i => i.Code == inviteCode);
                        if (invite != null)
                        {
                            perms.CanChat = invite.DefaultPermissions.CanChat;
                            perms.CanControlPlayback = invite.DefaultPermissions.CanControlPlayback;
                            invite.CurrentUses++;
                        }
                    }

                    room.Permissions[userId] = perms;
                    room.LastUpdated = DateTime.UtcNow;
                    SaveRooms();
                }
            }
        }

        public void LeaveRoom(string roomId, string userId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (room.Participants.Remove(userId))
                {
                    room.Permissions.Remove(userId);
                    room.CoHostIds.Remove(userId);
                    room.LastUpdated = DateTime.UtcNow;
                    SaveRooms();
                }
            }
        }

        public void SetUserPermissions(string roomId, string userId, bool canChat, bool canControlPlayback)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (!room.Permissions.ContainsKey(userId))
                    room.Permissions[userId] = new ParticipantPermissions();

                room.Permissions[userId].CanChat = canChat;
                room.Permissions[userId].CanControlPlayback = canControlPlayback;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void ToggleCoHost(string roomId, string userId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (room.CoHostIds.Contains(userId))
                    room.CoHostIds.Remove(userId);
                else
                    room.CoHostIds.Add(userId);
                
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void TransferOwnership(string roomId, string newOwnerId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.OwnerId = newOwnerId;
                room.CoHostIds.Remove(newOwnerId);
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void AddMessage(string roomId, ChatMessage message)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (room.Permissions.TryGetValue(message.UserId, out var perm) && !perm.CanChat && room.OwnerId != message.UserId && !room.CoHostIds.Contains(message.UserId))
                {
                    return;
                }

                room.Messages.Add(message);
                room.LastMessagePreview = $"{message.UserName}: {message.Text}";
                if (room.Messages.Count > 100) room.Messages.RemoveAt(0);
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void SetTheme(string roomId, string theme)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.CurrentTheme = theme;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void SetBuffering(string roomId, string userId, bool isBuffering)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                if (isBuffering && !room.BufferingUserIds.Contains(userId))
                    room.BufferingUserIds.Add(userId);
                else if (!isBuffering)
                    room.BufferingUserIds.Remove(userId);
                
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void CreatePoll(string roomId, string question, List<string> options)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                var poll = new Poll { Question = question, Options = options };
                foreach (var opt in options) poll.Votes[opt] = new List<string>();
                room.ActivePolls.Add(poll);
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void Vote(string roomId, string pollId, string userId, string option)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                var poll = room.ActivePolls.FirstOrDefault(p => p.Id == pollId);
                if (poll != null && !poll.IsClosed)
                {
                    foreach (var votes in poll.Votes.Values) votes.Remove(userId);
                    if (poll.Votes.ContainsKey(option)) poll.Votes[option].Add(userId);
                    room.LastUpdated = DateTime.UtcNow;
                    SaveRooms();
                }
            }
        }

        public void AddReaction(string roomId, string emoji)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.RecentReactions.Add(emoji);
                if (room.RecentReactions.Count > 10) room.RecentReactions.RemoveAt(0);
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void ToggleHostControl(string roomId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.IsHostOnlyControl = !room.IsHostOnlyControl;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
            }
        }

        public void SetWebhook(string roomId, string url)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.DiscordWebhookUrl = url;
                room.LastUpdated = DateTime.UtcNow;
                SaveRooms();
                _ = SendDiscordMessage(url, $"🔗 **Discord Webhook Connected!**\nRoom: `{room.Name}`\nStatus: `Active`\n\nNotifications for this party will be sent here.");
            }
        }

        public void SetDiscordStage(string roomId, string botToken, string stageId)
        {
            if (_rooms.TryGetValue(roomId, out var room))
            {
                room.DiscordBotToken = botToken;
                room.DiscordStageId = stageId;
                SaveRooms(true);
            }
        }

        public async Task UpdateDiscordStage(string roomId, string title)
        {
            if (_rooms.TryGetValue(roomId, out var room) && 
                !string.IsNullOrEmpty(room.DiscordBotToken) && 
                !string.IsNullOrEmpty(room.DiscordStageId))
            {
                try
                {
                    var url = $"https://discord.com/api/v10/channels/{room.DiscordStageId}";
                    var payload = new { topic = $"🍿 Watching: {title}" };
                    var json = JsonSerializer.Serialize(payload);
                    
                    var request = new HttpRequestMessage(new HttpMethod("PATCH"), url);
                    request.Headers.Add("Authorization", $"Bot {room.DiscordBotToken}");
                    request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                    await _httpClient.SendAsync(request);
                }
                catch { }
            }
        }

        private static async Task SendDiscordMessage(string url, string content)
        {
            try
            {
                var payload = new { content = content };
                var json = JsonSerializer.Serialize(payload);
                await _httpClient.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));
            }
            catch { }
        }

        public IEnumerable<JellyPartyRoom> GetAllRooms() => _rooms.Values;
    }
}
