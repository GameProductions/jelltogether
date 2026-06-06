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
        public Dictionary<string, ParticipantProfile> ParticipantProfiles { get; set; } = new();
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
        public string LastDiscordChatMessageId { get; set; } = string.Empty;
        public DateTime? LastDiscordChatSyncAt { get; set; }
        public List<string> RecentReactions { get; set; } = new();
        public List<string> ActivePlaybackSessionIds { get; set; } = new();
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

    public class ParticipantProfile
    {
        public string UserId { get; set; } = string.Empty;
        public string DisplayName { get; set; } = string.Empty;
        public string MediaUserId { get; set; } = string.Empty;
        public string ProfileImageUrl { get; set; } = string.Empty;
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
        public string Source { get; set; } = "jelltogether";
        public string ExternalMessageId { get; set; } = string.Empty;
        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }

    public class RoomManager
    {
        private readonly ConcurrentDictionary<string, JellTogetherRoom> _rooms = new();
        private readonly string _storagePath;
        private readonly object _fileLock = new();
        private readonly object _roomLock = new();
        private static readonly HttpClient _httpClient = new()
        {
            Timeout = TimeSpan.FromSeconds(8)
        };
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
                    var directory = Path.GetDirectoryName(_storagePath);
                    if (!string.IsNullOrWhiteSpace(directory))
                    {
                        Directory.CreateDirectory(directory);
                    }

                    var tempPath = $"{_storagePath}.{Guid.NewGuid():N}.tmp";
                    var backupPath = $"{_storagePath}.bak";
                    File.WriteAllText(tempPath, json);

                    if (File.Exists(_storagePath))
                    {
                        File.Copy(_storagePath, backupPath, overwrite: true);
                    }

                    File.Move(tempPath, _storagePath, overwrite: true);
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
                var rooms = TryReadRooms(_storagePath);
                if (rooms == null)
                {
                    rooms = TryReadRooms($"{_storagePath}.bak");
                }

                if (rooms == null) return;

                foreach (var room in rooms)
                {
                    if (!string.IsNullOrWhiteSpace(room.Id))
                    {
                        _rooms[room.Id] = room;
                    }
                }
            }
        }

        private static List<JellTogetherRoom>? TryReadRooms(string path)
        {
            try
            {
                if (!File.Exists(path)) return null;
                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<List<JellTogetherRoom>>(json);
            }
            catch (JsonException)
            {
                return null;
            }
            catch (IOException)
            {
                return null;
            }
            catch (UnauthorizedAccessException)
            {
                return null;
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
                message.Source = string.IsNullOrWhiteSpace(message.Source) ? "jelltogether" : TrimToLimit(message.Source, 32);
                room.Messages.Add(message);
                room.LastMessagePreview = $"{message.UserName}: {message.Text}";
                if (room.Messages.Count > 100) room.Messages.RemoveAt(0);
                room.Stats.TotalMessages++;
                room.Stats.TopChatter = message.UserId;
                Touch(room);
                return true;
            }
        }

        public bool AddDiscordMessage(string roomId, ChatMessage message, string discordMessageId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                discordMessageId = TrimToLimit(discordMessageId, 64);
                if (string.IsNullOrWhiteSpace(discordMessageId)) return false;
                if (room.Messages.Any(existing => existing.Source == "discord" && existing.ExternalMessageId == discordMessageId)) return false;

                message.UserId = string.IsNullOrWhiteSpace(message.UserId) ? $"discord:{discordMessageId}" : TrimToLimit(message.UserId, 96);
                message.UserName = string.IsNullOrWhiteSpace(message.UserName) ? "Discord" : TrimToLimit(message.UserName, 80);
                message.Text = TrimToLimit(message.Text, 1000);
                message.Source = "discord";
                message.ExternalMessageId = discordMessageId;
                message.Timestamp = message.Timestamp == default ? DateTime.UtcNow : message.Timestamp;
                room.Messages.Add(message);
                room.LastDiscordChatMessageId = MaxSnowflake(room.LastDiscordChatMessageId, discordMessageId);
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

        public async Task<(bool Success, string Error)> UpdateDiscordStage(string roomId, string title, string? configuredBotToken = null, string? configuredStageId = null)
        {
            string? botToken;
            string? stageId;
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room))
                {
                    return (false, "Room not found.");
                }

                botToken = string.IsNullOrWhiteSpace(configuredBotToken) ? room.DiscordBotToken : configuredBotToken;
                stageId = string.IsNullOrWhiteSpace(configuredStageId) ? room.DiscordStageId : configuredStageId;
            }

            if (string.IsNullOrWhiteSpace(botToken))
            {
                return (false, "Discord bot token is missing.");
            }

            if (string.IsNullOrWhiteSpace(stageId))
            {
                return (false, "Discord Stage channel is missing.");
            }

            try
            {
                var url = $"https://discord.com/api/v10/stage-instances/{TrimToLimit(stageId, 64)}";
                var payload = new { topic = TrimToLimit($"🍿 Watching: {title}", 120) };
                var json = JsonSerializer.Serialize(payload);

                var request = new HttpRequestMessage(new HttpMethod("PATCH"), url);
                request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");
                request.Content = new StringContent(json, Encoding.UTF8, "application/json");

                using var response = await _httpClient.SendAsync(request);
                if (response.IsSuccessStatusCode)
                {
                    return (true, string.Empty);
                }

                var responseText = await response.Content.ReadAsStringAsync();
                var detail = string.IsNullOrWhiteSpace(responseText) ? string.Empty : $": {TrimToLimit(responseText, 240)}";
                return (false, $"Discord API returned {(int)response.StatusCode}{detail}");
            }
            catch (Exception ex)
            {
            return (false, ex.Message);
            }
        }

        public bool SetRoomDiscordStage(string roomId, string? stageId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                room.DiscordStageId = TrimToLimit(stageId ?? string.Empty, 64);
                Touch(room);
                return true;
            }
        }

        public async Task SyncMessageToDiscordStage(string roomId, ChatMessage message, string? configuredBotToken, string? configuredStageId, bool enabled)
        {
            if (!enabled || message.Source == "discord" || string.IsNullOrWhiteSpace(message.Text)) return;

            string? botToken;
            string? stageId;
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return;
                botToken = string.IsNullOrWhiteSpace(configuredBotToken) ? room.DiscordBotToken : configuredBotToken;
                stageId = string.IsNullOrWhiteSpace(configuredStageId) ? room.DiscordStageId : configuredStageId;
            }

            if (string.IsNullOrWhiteSpace(botToken) || string.IsNullOrWhiteSpace(stageId)) return;

            try
            {
                var content = TrimToLimit($"**{message.UserName}:** {message.Text}", 1900);
                var payload = JsonSerializer.Serialize(new
                {
                    content,
                    allowed_mentions = new { parse = Array.Empty<string>() }
                });
                using var request = new HttpRequestMessage(HttpMethod.Post, $"https://discord.com/api/v10/channels/{TrimToLimit(stageId, 64)}/messages");
                request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");
                request.Content = new StringContent(payload, Encoding.UTF8, "application/json");
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                await _httpClient.SendAsync(request, cts.Token);
            }
            catch
            {
                // Chat sync is best-effort and should never block the local party chat.
            }
        }

        public async Task<int> PullDiscordStageMessages(string roomId, string? configuredBotToken, string? configuredStageId, bool enabled)
        {
            if (!enabled) return 0;

            string? botToken;
            string? stageId;
            string lastMessageId;
            DateTime? lastSyncAt;
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return 0;
                botToken = string.IsNullOrWhiteSpace(configuredBotToken) ? room.DiscordBotToken : configuredBotToken;
                stageId = string.IsNullOrWhiteSpace(configuredStageId) ? room.DiscordStageId : configuredStageId;
                lastMessageId = room.LastDiscordChatMessageId;
                lastSyncAt = room.LastDiscordChatSyncAt;
                if (lastSyncAt.HasValue && DateTime.UtcNow - lastSyncAt.Value < TimeSpan.FromSeconds(4))
                {
                    return 0;
                }

                room.LastDiscordChatSyncAt = DateTime.UtcNow;
            }

            if (string.IsNullOrWhiteSpace(botToken) || string.IsNullOrWhiteSpace(stageId)) return 0;

            try
            {
                var url = $"https://discord.com/api/v10/channels/{TrimToLimit(stageId, 64)}/messages?limit=25";
                if (!string.IsNullOrWhiteSpace(lastMessageId))
                {
                    url += $"&after={Uri.EscapeDataString(lastMessageId)}";
                }

                using var request = new HttpRequestMessage(HttpMethod.Get, url);
                request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");
                using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
                using var response = await _httpClient.SendAsync(request, cts.Token);
                if (!response.IsSuccessStatusCode) return 0;

                await using var stream = await response.Content.ReadAsStreamAsync();
                using var document = await JsonDocument.ParseAsync(stream);
                if (document.RootElement.ValueKind != JsonValueKind.Array) return 0;

                var added = 0;
                var messages = document.RootElement.EnumerateArray()
                    .Select(message => message.Clone())
                    .OrderBy(message => JsonString(message, "id"), StringComparer.Ordinal)
                    .ToList();

                foreach (var discordMessage in messages)
                {
                    var id = JsonString(discordMessage, "id");
                    if (string.IsNullOrWhiteSpace(id)) continue;
                    SetLastDiscordMessageId(roomId, id);
                    if (IsDiscordBotMessage(discordMessage)) continue;

                    var content = JsonString(discordMessage, "content");
                    if (string.IsNullOrWhiteSpace(content)) continue;

                    var author = discordMessage.TryGetProperty("author", out var authorElement) ? authorElement : default;
                    var authorId = author.ValueKind == JsonValueKind.Object ? JsonString(author, "id") : string.Empty;
                    var authorName = author.ValueKind == JsonValueKind.Object
                        ? JsonString(author, "global_name") ?? JsonString(author, "username") ?? "Discord"
                        : "Discord";

                    var timestamp = DateTime.UtcNow;
                    var timestampText = JsonString(discordMessage, "timestamp");
                    if (!string.IsNullOrWhiteSpace(timestampText) && DateTime.TryParse(timestampText, out var parsed))
                    {
                        timestamp = parsed.ToUniversalTime();
                    }

                    if (AddDiscordMessage(roomId, new ChatMessage
                    {
                        UserId = $"discord:{authorId}",
                        UserName = authorName,
                        Text = content,
                        Timestamp = timestamp
                    }, id))
                    {
                        added++;
                    }
                }

                return added;
            }
            catch
            {
                return 0;
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

        public bool AddToQueue(string roomId, string title, string userId, string mediaId = "", string libraryId = "", string mediaType = "", string overview = "")
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room) || !room.Participants.Contains(userId))
                {
                    return false;
                }

                if (room.Permissions.TryGetValue(userId, out var perm) &&
                    !perm.CanAddToQueue &&
                    room.OwnerId != userId &&
                    !room.CoHostIds.Contains(userId))
                {
                    return false;
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
                return true;
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

        public bool ClearQueue(string roomId, string userId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                if (room.OwnerId != userId && !room.CoHostIds.Contains(userId)) return false;

                room.Queue.Clear();
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
                room.ActivePlaybackSessionIds.Clear();
                Touch(room);
            }
        }

        public bool SetActivePlaybackSession(string roomId, string sessionId, bool active)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return false;
                sessionId = TrimToLimit(sessionId, 64);
                if (string.IsNullOrWhiteSpace(sessionId)) return false;

                if (active)
                {
                    if (!room.ActivePlaybackSessionIds.Contains(sessionId, StringComparer.OrdinalIgnoreCase))
                    {
                        room.ActivePlaybackSessionIds.Add(sessionId);
                        Touch(room);
                    }
                }
                else
                {
                    var removed = room.ActivePlaybackSessionIds.RemoveAll(id => id.Equals(sessionId, StringComparison.OrdinalIgnoreCase)) > 0;
                    if (removed) Touch(room);
                }

                return true;
            }
        }

        public List<string> GetActivePlaybackSessionIds(string roomId)
        {
            lock (_roomLock)
            {
                if (!_rooms.TryGetValue(roomId, out var room)) return new List<string>();
                return room.ActivePlaybackSessionIds.ToList();
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

        private void SetLastDiscordMessageId(string roomId, string messageId)
        {
            lock (_roomLock)
            {
                if (_rooms.TryGetValue(roomId, out var room))
                {
                    room.LastDiscordChatMessageId = MaxSnowflake(room.LastDiscordChatMessageId, messageId);
                    room.LastDiscordChatSyncAt = DateTime.UtcNow;
                }
            }
        }

        private static bool IsDiscordBotMessage(JsonElement message)
        {
            if (!message.TryGetProperty("author", out var author) || author.ValueKind != JsonValueKind.Object) return false;
            return author.TryGetProperty("bot", out var bot) && bot.ValueKind == JsonValueKind.True;
        }

        private static string? JsonString(JsonElement element, string propertyName)
        {
            if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(propertyName, out var property)) return null;
            return property.ValueKind == JsonValueKind.String ? property.GetString() : null;
        }

        private static string MaxSnowflake(string current, string next)
        {
            if (string.IsNullOrWhiteSpace(current)) return next;
            if (string.IsNullOrWhiteSpace(next)) return current;
            if (ulong.TryParse(current, out var currentValue) && ulong.TryParse(next, out var nextValue))
            {
                return nextValue > currentValue ? next : current;
            }

            return string.CompareOrdinal(next, current) > 0 ? next : current;
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
