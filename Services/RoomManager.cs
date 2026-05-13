using System.Collections.Concurrent;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace JellTogether.Plugin.Services
{
    public class JellTogetherRoom
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string RoomCode { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public bool IsPrivate { get; set; } = false;
        public bool AllowParticipantInvites { get; set; } = true;
        public bool AllowQueueVoting { get; set; } = true;
        public bool RequireJoinApproval { get; set; } = false;
        public bool IsJoinLocked { get; set; } = false;
        public string OwnerId { get; set; } = string.Empty;
        public List<string> CoHostIds { get; set; } = new();
        public List<string> Participants { get; set; } = new();
        public List<string> PendingParticipantIds { get; set; } = new();
        public List<string> BannedParticipantIds { get; set; } = new();
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
        [JsonIgnore]
        public string? DiscordBotToken { get; set; }
        public string? DiscordStageId { get; set; }
        public List<string> RecentReactions { get; set; } = new();
        public string NowPlayingTitle { get; set; } = string.Empty;
        public string NowPlayingMediaId { get; set; } = string.Empty;
        public DateTime? NowPlayingStartedAt { get; set; }
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime LastUpdated { get; set; } = DateTime.UtcNow;
    }

    public class QueueItem
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Title { get; set; } = string.Empty;
        public string MediaId { get; set; } = string.Empty;
        public string LibraryId { get; set; } = string.Empty;
        public string MediaType { get; set; } = string.Empty;
        public string Overview { get; set; } = string.Empty;
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
        public bool CanAddToQueue { get; set; } = true;
        public bool CanManageParticipants { get; set; } = false;
    }

    public enum JoinRoomResult
    {
        Joined,
        PendingApproval,
        Locked,
        Banned,
        Forbidden,
        NotFound
    }

    public class ChatMessage
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Text { get; set; } = string.Empty;
        public string ReplyToMessageId { get; set; } = string.Empty;
        public string ReplyToUserName { get; set; } = string.Empty;
        public string ReplyToText { get; set; } = string.Empty;
        public List<string> Mentions { get; set; } = new();
        public Dictionary<string, List<string>> Reactions { get; set; } = new();
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
                    RoomCode = GenerateUniqueCode(),
                    AllowParticipantInvites = global::JellTogether.Plugin.Plugin.Instance?.Configuration.AllowParticipantInvitesByDefault ?? true,
                    AllowQueueVoting = global::JellTogether.Plugin.Plugin.Instance?.Configuration.AllowQueueVotingByDefault ?? true
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

        public bool RenameRoom(string roomId, string name)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                var nextName = TrimToLimit(name, 120);
                if (string.IsNullOrWhiteSpace(nextName)) return false;

                room.Name = nextName;
                Touch(room);
                return true;
            }
        }

        public bool ToggleMessageReaction(string roomId, string messageId, string userId, string emoji)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.Participants.Contains(userId)) return false;
                var message = room.Messages.FirstOrDefault(m => m.Id == messageId);
                if (message == null) return false;

                emoji = TrimToLimit(emoji, 16);
                if (string.IsNullOrWhiteSpace(emoji)) return false;
                if (!message.Reactions.TryGetValue(emoji, out var users))
                {
                    users = new List<string>();
                    message.Reactions[emoji] = users;
                }

                if (users.Contains(userId))
                {
                    users.Remove(userId);
                    if (users.Count == 0) message.Reactions.Remove(emoji);
                }
                else
                {
                    users.Add(userId);
                }

                Touch(room);
                return true;
            }
        }

        public bool DeleteRoom(string roomId)
        {
            lock (_roomLock)
            {
                var removed = _rooms.TryRemove(roomId, out _);
                if (removed) SaveRooms();
                return removed;
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

        public void ToggleQueueVoting(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.AllowQueueVoting = !room.AllowQueueVoting;
                    Touch(room);
                }
            }
        }

        public void ToggleJoinApproval(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.RequireJoinApproval = !room.RequireJoinApproval;
                    Touch(room);
                }
            }
        }

        public void ToggleJoinLock(string roomId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.IsJoinLocked = !room.IsJoinLocked;
                    Touch(room);
                }
            }
        }

        public JoinRoomResult JoinRoom(string roomId, string userId, string? inviteCode = null)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return JoinRoomResult.NotFound;
                if (room.BannedParticipantIds.Contains(userId)) return JoinRoomResult.Banned;
                if (room.Participants.Contains(userId)) return JoinRoomResult.Joined;
                if (room.IsJoinLocked) return JoinRoomResult.Locked;

                var invite = string.IsNullOrWhiteSpace(inviteCode)
                    ? null
                    : room.Invitations.FirstOrDefault(i => IsInviteUsable(i, inviteCode));

                var hasRoomCode = !string.IsNullOrWhiteSpace(inviteCode) &&
                    room.RoomCode.Equals(inviteCode, StringComparison.OrdinalIgnoreCase);

                if (room.IsPrivate && !hasRoomCode && invite == null) return JoinRoomResult.Forbidden;

                if (room.RequireJoinApproval)
                {
                    if (!room.PendingParticipantIds.Contains(userId)) room.PendingParticipantIds.Add(userId);
                    Touch(room);
                    return JoinRoomResult.PendingApproval;
                }

                AddParticipant(room, userId, invite);
                Touch(room);
                return JoinRoomResult.Joined;
            }
        }

        public void LeaveRoom(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room)) RemoveParticipant(room, userId);
            }
        }

        public bool ApproveJoin(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.PendingParticipantIds.Remove(userId)) return false;
                AddParticipant(room, userId, null);
                Touch(room);
                return true;
            }
        }

        public bool RejectJoin(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                var removed = room.PendingParticipantIds.Remove(userId);
                if (removed) Touch(room);
                return removed;
            }
        }

        public bool KickParticipant(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || room.OwnerId == userId) return false;
                return RemoveParticipant(room, userId);
            }
        }

        public bool BanParticipant(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || room.OwnerId == userId) return false;
                if (!room.BannedParticipantIds.Contains(userId)) room.BannedParticipantIds.Add(userId);
                room.PendingParticipantIds.Remove(userId);
                RemoveParticipant(room, userId, touch: false);
                Touch(room);
                return true;
            }
        }

        public bool UnbanParticipant(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                var removed = room.BannedParticipantIds.Remove(userId);
                if (removed) Touch(room);
                return removed;
            }
        }

        public bool MoveSeat(string roomId, string userId, int seatIndex)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.Participants.Contains(userId)) return false;
                if (seatIndex < 0 || seatIndex >= 40) return false;
                if (room.CinemaSeats.Any(seat => seat.Value == seatIndex && seat.Key != userId)) return false;

                room.CinemaSeats[userId] = seatIndex;
                Touch(room);
                return true;
            }
        }

        public void SetUserPermissions(string roomId, string userId, bool canChat, bool canControlPlayback, bool canAddToQueue, bool canManageParticipants)
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
                    room.Permissions[userId].CanAddToQueue = canAddToQueue;
                    room.Permissions[userId].CanManageParticipants = canManageParticipants;
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
                    var cleanedOptions = (options ?? new List<string>())
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
                        if (!string.IsNullOrWhiteSpace(option) && poll.Votes.ContainsKey(option)) poll.Votes[option].Add(userId);
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
            string? botToken;
            string? stageId;
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room))
                {
                    return;
                }

                botToken = room.DiscordBotToken;
                stageId = room.DiscordStageId;
            }

            if (!string.IsNullOrEmpty(botToken) && !string.IsNullOrEmpty(stageId))
            {
                try
                {
                    var url = $"https://discord.com/api/v10/channels/{stageId}";
                    var payload = new { topic = $"🍿 Watching: {title}" };
                    var json = JsonSerializer.Serialize(payload);

                    var request = new HttpRequestMessage(new HttpMethod("PATCH"), url);
                    request.Headers.Add("Authorization", $"Bot {botToken}");
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

        public void AddToQueue(string roomId, string title, string userId, string mediaId = "", string libraryId = "", string mediaType = "", string overview = "")
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room) && room.Participants.Contains(userId))
                {
                    if (room.Permissions.TryGetValue(userId, out var perm) &&
                        !perm.CanAddToQueue &&
                        room.OwnerId != userId &&
                        !room.CoHostIds.Contains(userId))
                    {
                        return;
                    }

                    room.Queue.Add(new QueueItem
                    {
                        Title = TrimToLimit(title, 200),
                        MediaId = TrimToLimit(mediaId, 64),
                        LibraryId = TrimToLimit(libraryId, 64),
                        MediaType = TrimToLimit(mediaType, 40),
                        Overview = TrimToLimit(overview, 260),
                        AddedBy = userId
                    });
                    Touch(room);
                }
            }
        }

        public bool ToggleQueueVote(string roomId, string itemId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.Participants.Contains(userId) || !room.AllowQueueVoting) return false;
                var item = room.Queue.FirstOrDefault(i => i.Id == itemId);
                if (item == null) return false;

                if (item.Upvotes.Contains(userId))
                {
                    item.Upvotes.Remove(userId);
                }
                else
                {
                    item.Upvotes.Add(userId);
                }

                Touch(room);
                return true;
            }
        }

        public bool MoveQueueItem(string roomId, string itemId, int direction, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                if (room.OwnerId != userId && !room.CoHostIds.Contains(userId)) return false;

                var currentIndex = room.Queue.FindIndex(i => i.Id == itemId);
                if (currentIndex < 0) return false;
                var nextIndex = Math.Clamp(currentIndex + Math.Sign(direction), 0, room.Queue.Count - 1);
                if (nextIndex == currentIndex) return true;

                var item = room.Queue[currentIndex];
                room.Queue.RemoveAt(currentIndex);
                room.Queue.Insert(nextIndex, item);
                Touch(room);
                return true;
            }
        }

        public bool RemoveQueueItem(string roomId, string itemId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                var item = room.Queue.FirstOrDefault(i => i.Id == itemId);
                if (item == null) return false;

                var canManage = room.OwnerId == userId || room.CoHostIds.Contains(userId);
                if (!canManage && item.AddedBy != userId) return false;

                room.Queue.Remove(item);
                Touch(room);
                return true;
            }
        }

        public void MarkNowPlaying(string roomId, QueueItem item)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return;
                room.NowPlayingTitle = item.Title;
                room.NowPlayingMediaId = item.MediaId;
                room.NowPlayingStartedAt = DateTime.UtcNow;
                Touch(room);
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

        public bool RemoveTheory(string roomId, string theoryId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                var theory = room.Theories.FirstOrDefault(t => t.Id == theoryId);
                if (theory == null) return false;

                var canManage = room.OwnerId == userId || room.CoHostIds.Contains(userId);
                if (!canManage && theory.Author != userId) return false;

                room.Theories.Remove(theory);
                Touch(room);
                return true;
            }
        }

        public void AddTrivia(string roomId, TriviaQuestion question)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    var cleanedOptions = (question.Options ?? new List<string>())
                        .Select(o => TrimToLimit(o, 120))
                        .Where(o => !string.IsNullOrWhiteSpace(o))
                        .Distinct()
                        .Take(6)
                        .ToList();
                    if (string.IsNullOrWhiteSpace(question.Question) || cleanedOptions.Count < 2) return;

                    question.Question = TrimToLimit(question.Question, 200);
                    question.Options = cleanedOptions;
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

        private static void AddParticipant(JellTogetherRoom room, string userId, JellTogetherInvite? invite)
        {
            if (!room.Participants.Contains(userId)) room.Participants.Add(userId);
            room.PendingParticipantIds.Remove(userId);
            room.CinemaSeats[userId] = NextSeat(room);

            var perms = new ParticipantPermissions();
            if (invite != null)
            {
                perms.CanChat = invite.DefaultPermissions.CanChat;
                perms.CanControlPlayback = invite.DefaultPermissions.CanControlPlayback;
                perms.CanAddToQueue = invite.DefaultPermissions.CanAddToQueue;
                perms.CanManageParticipants = invite.DefaultPermissions.CanManageParticipants;
                invite.CurrentUses++;
            }

            room.Permissions[userId] = perms;
        }

        private bool RemoveParticipant(JellTogetherRoom room, string userId, bool touch = true)
        {
            var removed = room.Participants.Remove(userId);
            room.Permissions.Remove(userId);
            room.CoHostIds.Remove(userId);
            room.CinemaSeats.Remove(userId);
            room.BufferingUserIds.Remove(userId);
            if (removed && touch) Touch(room);
            return removed;
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
