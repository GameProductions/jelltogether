using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace JellTogether.Plugin.Services
{
    public class JellTogetherRoom
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
        public List<JellTogetherInvite> Invitations { get; set; } = new();
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

    public class JellTogetherInvite
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
        private readonly ConcurrentDictionary<string, JellTogetherRoom> _rooms = new();
        private readonly string _storagePath;
        private readonly object _fileLock = new();
        private readonly object _roomLock = new();
        private static readonly HttpClient _httpClient = new();
        private static readonly JsonSerializerOptions SerializerOptions = new() { WriteIndented = true };

        public RoomManager(string configPath)
        {
            _storagePath = Path.Combine(configPath, "rooms.json");
            LoadRooms();
        }

        private void SaveRooms()
        {
            lock (_fileLock)
            {
                try
                {
                    var json = JsonSerializer.Serialize(_rooms.Values, SerializerOptions);
                    File.WriteAllText(_storagePath, json);
                }
                catch (IOException ex)
                {
                    throw new InvalidOperationException("Unable to persist JellTogether rooms.", ex);
                }
                catch (UnauthorizedAccessException ex)
                {
                    throw new InvalidOperationException("Unable to persist JellTogether rooms.", ex);
                }
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
                        var rooms = JsonSerializer.Deserialize<List<JellTogetherRoom>>(json);
                        if (rooms != null)
                        {
                            foreach (var room in rooms) _rooms[room.Id] = room;
                        }
                    }
                }
                catch
                {
                    _rooms.Clear();
                }
            }
        }

        public JellTogetherRoom CreateRoom(string name, string ownerId)
        {
            lock (_roomLock)
            {
                var room = new JellTogetherRoom
                {
                    Name = TrimToLimit(name, 120),
                    OwnerId = ownerId,
                    RoomCode = GenerateUniqueCode()
                };
                room.Participants.Add(ownerId);
                room.CinemaSeats[ownerId] = 0;
                room.Permissions[ownerId] = new ParticipantPermissions();
                _rooms[room.Id] = room;
                SaveRooms();
                return CloneRoom(room);
            }
        }

        private static string GenerateRoomCode()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            return new string(Enumerable.Range(0, 6)
                .Select(_ => chars[RandomNumberGenerator.GetInt32(chars.Length)]).ToArray());
        }

        private string GenerateUniqueCode()
        {
            string code;
            do
            {
                code = GenerateRoomCode();
            } while (_rooms.Values.Any(r => r.RoomCode.Equals(code, StringComparison.OrdinalIgnoreCase) ||
                r.Invitations.Any(i => i.Code.Equals(code, StringComparison.OrdinalIgnoreCase))));

            return code;
        }

        public void TogglePrivacy(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.IsPrivate = !room.IsPrivate;
                    Touch(room);
                }
            }
        }

        public JellTogetherRoom? GetRoom(string roomId)
        {
            lock (_roomLock)
            {
                return _rooms.TryGetValue(roomId, out var room) ? CloneRoom(room) : null;
            }
        }

        public JellTogetherRoom? GetRoomByCode(string code)
        {
            lock (_roomLock)
            {
                var room = _rooms.Values.FirstOrDefault(r =>
                    r.RoomCode.Equals(code, StringComparison.OrdinalIgnoreCase) ||
                    r.Invitations.Any(i => IsInviteUsable(i, code)));

                return room == null ? null : CloneRoom(room);
            }
        }

        public JellTogetherInvite CreateInvite(string roomId, string creatorId, ParticipantPermissions perms, int hoursValid = 24, int maxUses = 0)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    var invite = new JellTogetherInvite
                    {
                        Code = GenerateUniqueCode(),
                        CreatedBy = creatorId,
                        DefaultPermissions = perms,
                        ExpiresAt = hoursValid > 0 ? DateTime.UtcNow.AddHours(Math.Min(hoursValid, 24 * 30)) : null,
                        MaxUses = Math.Max(0, maxUses)
                    };
                    room.Invitations.Add(invite);
                    Touch(room);
                    return invite;
                }
            }

            throw new Exception("Room not found");
        }

        public void ToggleParticipantInvites(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.AllowParticipantInvites = !room.AllowParticipantInvites;
                    Touch(room);
                }
            }
        }

        public bool JoinRoom(string roomId, string userId, string? inviteCode = null)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;

                if (!room.Participants.Contains(userId))
                {
                    var invite = string.IsNullOrWhiteSpace(inviteCode)
                        ? null
                        : room.Invitations.FirstOrDefault(i => IsInviteUsable(i, inviteCode));

                    var hasRoomCode = !string.IsNullOrWhiteSpace(inviteCode) &&
                        room.RoomCode.Equals(inviteCode, StringComparison.OrdinalIgnoreCase);

                    if (room.IsPrivate && !hasRoomCode && invite == null) return false;

                    room.Participants.Add(userId);
                    room.CinemaSeats[userId] = NextSeat(room);

                    var perms = new ParticipantPermissions();
                    if (invite != null)
                    {
                        perms.CanChat = invite.DefaultPermissions.CanChat;
                        perms.CanControlPlayback = invite.DefaultPermissions.CanControlPlayback;
                        invite.CurrentUses++;
                    }

                    room.Permissions[userId] = perms;
                    Touch(room);
                }

                return true;
            }
        }

        public void LeaveRoom(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Remove(userId))
                {
                    room.Permissions.Remove(userId);
                    room.CoHostIds.Remove(userId);
                    room.CinemaSeats.Remove(userId);
                    room.BufferingUserIds.Remove(userId);
                    Touch(room);
                }
            }
        }

        public void SetUserPermissions(string roomId, string userId, bool canChat, bool canControlPlayback)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    if (!room.Participants.Contains(userId)) return;
                    if (!room.Permissions.ContainsKey(userId))
                        room.Permissions[userId] = new ParticipantPermissions();

                    room.Permissions[userId].CanChat = canChat;
                    room.Permissions[userId].CanControlPlayback = canControlPlayback;
                    Touch(room);
                }
            }
        }

        public void ToggleCoHost(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    if (room.CoHostIds.Contains(userId))
                        room.CoHostIds.Remove(userId);
                    else if (room.OwnerId != userId)
                        room.CoHostIds.Add(userId);

                    Touch(room);
                }
            }
        }

        public void TransferOwnership(string roomId, string newOwnerId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(newOwnerId))
                {
                    room.OwnerId = newOwnerId;
                    room.CoHostIds.Remove(newOwnerId);
                    if (!room.Permissions.ContainsKey(newOwnerId))
                        room.Permissions[newOwnerId] = new ParticipantPermissions();
                    Touch(room);
                }
            }
        }

        public bool AddMessage(string roomId, ChatMessage message)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.Participants.Contains(message.UserId)) return false;

                if (room.Permissions.TryGetValue(message.UserId, out var perm) && !perm.CanChat && room.OwnerId != message.UserId && !room.CoHostIds.Contains(message.UserId))
                {
                    return false;
                }

                message.Text = TrimToLimit(message.Text, 1000);
                room.Messages.Add(message);
                room.LastMessagePreview = $"{message.UserName}: {message.Text}";
                if (room.Messages.Count > 100) room.Messages.RemoveAt(0);
                room.Stats.TotalMessages++;
                room.Stats.TopChatter = message.UserId;
                Touch(room);
                return true;
            }
        }

        public void SetTheme(string roomId, string theme)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    var allowed = new[] { "default", "cinema", "horror", "anime", "scifi", "cyberpunk" };
                    room.CurrentTheme = allowed.Contains(theme) ? theme : "default";
                    Touch(room);
                }
            }
        }

        public void SetBuffering(string roomId, string userId, bool isBuffering)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    if (isBuffering && !room.BufferingUserIds.Contains(userId))
                        room.BufferingUserIds.Add(userId);
                    else if (!isBuffering)
                        room.BufferingUserIds.Remove(userId);

                    Touch(room);
                }
            }
        }

        public void CreatePoll(string roomId, string question, List<string> options)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    var cleanedOptions = options
                        .Select(o => TrimToLimit(o, 120))
                        .Where(o => !string.IsNullOrWhiteSpace(o))
                        .Distinct()
                        .Take(6)
                        .ToList();
                    if (string.IsNullOrWhiteSpace(question) || cleanedOptions.Count < 2) return;

                    var poll = new Poll { Question = TrimToLimit(question, 200), Options = cleanedOptions };
                    foreach (var opt in cleanedOptions) poll.Votes[opt] = new List<string>();
                    room.ActivePolls.Add(poll);
                    Touch(room);
                }
            }
        }

        public void Vote(string roomId, string pollId, string userId, string option)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    var poll = room.ActivePolls.FirstOrDefault(p => p.Id == pollId);
                    if (poll != null && !poll.IsClosed)
                    {
                        foreach (var votes in poll.Votes.Values) votes.Remove(userId);
                        if (poll.Votes.ContainsKey(option)) poll.Votes[option].Add(userId);
                        Touch(room);
                    }
                }
            }
        }

        public void AddReaction(string roomId, string emoji, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    room.RecentReactions.Add(TrimToLimit(emoji, 16));
                    if (room.RecentReactions.Count > 10) room.RecentReactions.RemoveAt(0);
                    room.Stats.TotalReactions++;
                    room.Stats.TopReactor = userId;
                    Touch(room);
                }
            }
        }

        public void ToggleHostControl(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.IsHostOnlyControl = !room.IsHostOnlyControl;
                    Touch(room);
                }
            }
        }

        public bool SetWebhook(string roomId, string url)
        {
            if (!IsDiscordWebhook(url)) return false;

            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                room.DiscordWebhookUrl = url;
                Touch(room);
                _ = SendDiscordMessage(url, $"🔗 **Discord Webhook Connected!**\nRoom: `{room.Name}`\nStatus: `Active`\n\nNotifications for this party will be sent here.");
                return true;
            }
        }

        public void SetDiscordStage(string roomId, string botToken, string stageId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.DiscordBotToken = TrimToLimit(botToken, 256);
                    room.DiscordStageId = TrimToLimit(stageId, 64);
                    Touch(room);
                }
            }
        }

        public async Task UpdateDiscordStage(string roomId, string title)
        {
            JellTogetherRoom? room;
            lock (_roomLock)
            {
                room = _rooms.TryGetValue(roomId, out var existing) ? CloneRoom(existing) : null;
            }

            if (room != null &&
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

        public void AddToQueue(string roomId, string title, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    room.Queue.Add(new QueueItem { Title = TrimToLimit(title, 200), AddedBy = userId });
                    Touch(room);
                }
            }
        }

        public void AddTheory(string roomId, string text, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    room.Theories.Add(new TheoryNote { Text = TrimToLimit(text, 1000), Author = userId });
                    Touch(room);
                }
            }
        }

        public void AddTrivia(string roomId, TriviaQuestion question)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    question.Question = TrimToLimit(question.Question, 200);
                    question.Options = question.Options.Select(o => TrimToLimit(o, 120)).Take(6).ToList();
                    room.Trivia.Add(question);
                    Touch(room);
                }
            }
        }

        public IEnumerable<JellTogetherRoom> GetAllRooms()
        {
            lock (_roomLock)
            {
                return _rooms.Values.Select(CloneRoom).ToList();
            }
        }

        private void Touch(JellTogetherRoom room)
        {
            room.LastUpdated = DateTime.UtcNow;
            SaveRooms();
        }

        private static bool IsInviteUsable(JellTogetherInvite invite, string code)
        {
            return invite.Code.Equals(code, StringComparison.OrdinalIgnoreCase) &&
                (invite.ExpiresAt == null || invite.ExpiresAt > DateTime.UtcNow) &&
                (invite.MaxUses == 0 || invite.CurrentUses < invite.MaxUses);
        }

        private static int NextSeat(JellTogetherRoom room)
        {
            var seat = 0;
            while (room.CinemaSeats.Values.Contains(seat)) seat++;
            return seat;
        }

        private static bool IsDiscordWebhook(string url)
        {
            return Uri.TryCreate(url, UriKind.Absolute, out var uri) &&
                uri.Scheme == Uri.UriSchemeHttps &&
                (uri.Host.Equals("discord.com", StringComparison.OrdinalIgnoreCase) ||
                 uri.Host.Equals("discordapp.com", StringComparison.OrdinalIgnoreCase)) &&
                uri.AbsolutePath.StartsWith("/api/webhooks/", StringComparison.OrdinalIgnoreCase);
        }

        private static string TrimToLimit(string value, int limit)
        {
            value = value?.Trim() ?? string.Empty;
            return value.Length <= limit ? value : value[..limit];
        }

        private static JellTogetherRoom CloneRoom(JellTogetherRoom room)
        {
            var json = JsonSerializer.Serialize(room, SerializerOptions);
            return JsonSerializer.Deserialize<JellTogetherRoom>(json) ?? new JellTogetherRoom();
        }
    }
}
