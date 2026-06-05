using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Reflection;
using System.Security.Claims;
using System.Text.Json;
using System.Text.RegularExpressions;
using MediaBrowser.Common.Api;
using MediaBrowser.Controller.Session;
using MediaBrowser.Model.Session;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.WebUtilities;
using JellTogether.Plugin.Services;

namespace JellTogether.Plugin.Api
{
    public class CreatePollRequest
    {
        public string Question { get; set; } = string.Empty;
        public List<string> Options { get; set; } = new();
    }

    public class CreateInviteRequest
    {
        public bool CanChat { get; set; } = true;
        public bool CanControl { get; set; } = true;
        public bool CanAddToQueue { get; set; } = true;
        public int HoursValid { get; set; } = 24;
        public int MaxUses { get; set; } = 0;
    }

    public class SyncDiscordStageRequest
    {
        public string Title { get; set; } = string.Empty;
    }

    public class CompanionSettingsRequest
    {
        public string PublicJellyfinUrl { get; set; } = string.Empty;
        public string PublicCompanionUrl { get; set; } = string.Empty;
    }

    public class GlobalSettingsRequest
    {
        public string PublicJellyfinUrl { get; set; } = string.Empty;
        public string PublicCompanionUrl { get; set; } = string.Empty;
        public List<string> EnabledLibraryIds { get; set; } = new();
        public bool AllowQueueVotingByDefault { get; set; } = true;
        public bool AllowParticipantQueueAdds { get; set; } = true;
        public bool AllowParticipantInvitesByDefault { get; set; } = true;
        public bool AllowAndroidTvPlaybackTargets { get; set; } = true;
        public bool PersistRoomHistory { get; set; } = true;
        public int DefaultInviteExpirationHours { get; set; } = 24;
        public string DiscordStageId { get; set; } = string.Empty;
        public string DiscordBotToken { get; set; } = string.Empty;
        public bool ClearDiscordBotToken { get; set; } = false;
    }

    public class DiscordStageTestRequest
    {
        public string DiscordStageId { get; set; } = string.Empty;
        public string DiscordBotToken { get; set; } = string.Empty;
    }

    public class DiscordStageTestResult
    {
        public bool Success { get; set; }
        public string Status { get; set; } = string.Empty;
        public string ChannelId { get; set; } = string.Empty;
        public string ChannelName { get; set; } = string.Empty;
        public string GuildId { get; set; } = string.Empty;
        public string GuildName { get; set; } = string.Empty;
        public List<string> Checks { get; set; } = new();
    }

    public class DiscordStageChannelOption
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
        public string GuildId { get; set; } = string.Empty;
        public string GuildName { get; set; } = string.Empty;
        public string Label => string.IsNullOrWhiteSpace(GuildName) ? Name : $"{GuildName} / {Name}";
    }

    public class QueueItemRequest
    {
        public string Title { get; set; } = string.Empty;
        public string MediaId { get; set; } = string.Empty;
        public string LibraryId { get; set; } = string.Empty;
        public string MediaType { get; set; } = string.Empty;
        public string Overview { get; set; } = string.Empty;
    }

    public class ChatMessageRequest
    {
        public string Text { get; set; } = string.Empty;
        public string ReplyToMessageId { get; set; } = string.Empty;
    }

    public class StartWatchPartyRequest
    {
        public List<string> TargetSessionIds { get; set; } = new();
    }

    public class PlaybackTargetDto
    {
        public string SessionId { get; set; } = string.Empty;
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Client { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public bool IsActive { get; set; }
        public bool SupportsRemoteControl { get; set; }
        public bool SupportsMediaControl { get; set; }
        public bool IsCurrentUser { get; set; }
        public bool IsAndroidTv { get; set; }
        public bool CanStartPlayback { get; set; }
        public string EligibilityReason { get; set; } = string.Empty;
    }

    public class StartWatchPartyResult
    {
        public string Title { get; set; } = string.Empty;
        public int StartedCount { get; set; }
        public int EligibleCount { get; set; }
        public List<string> FailedSessionIds { get; set; } = new();
        public string ControllingSessionId { get; set; } = string.Empty;
        public string ControllingUserId { get; set; } = string.Empty;
        public List<PlaybackStartAttempt> Attempts { get; set; } = new();
        public List<PlaybackTargetDto> AvailableTargets { get; set; } = new();
    }

    public class PlaybackStartAttempt
    {
        public string SessionId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public string Client { get; set; } = string.Empty;
        public string DeviceName { get; set; } = string.Empty;
        public bool Success { get; set; }
        public string Status { get; set; } = string.Empty;
        public string Error { get; set; } = string.Empty;
    }

    [ApiController]
    [Route("jelltogether")]
    [Authorize]
    public class JellTogetherController : ControllerBase
    {
        private readonly ISessionManager _sessionManager;
        private static readonly HttpClient DiscordHttpClient = new();
        private RoomManager _roomManager => Plugin.Instance?.RoomManager ?? throw new System.Exception("Plugin not initialized");
        private string CurrentUserId =>
            User.FindFirst(ClaimTypes.NameIdentifier)?.Value ??
            User.FindFirst("sub")?.Value ??
            User.FindFirst("uid")?.Value ??
            User.Identity?.Name ??
            "Unknown";

        public JellTogetherController(ISessionManager sessionManager)
        {
            _sessionManager = sessionManager;
        }

        [HttpGet]
        [AllowAnonymous]
        public IActionResult Open()
        {
            return Redirect(CompanionUrl());
        }

        [HttpGet("Companion")]
        [AllowAnonymous]
        public IActionResult OpenCompanion([FromQuery] string? code = null)
        {
            return StandaloneCompanion(code);
        }

        [HttpGet("Invite/{code}")]
        [AllowAnonymous]
        public IActionResult OpenInvite(string code)
        {
            return Redirect(CompanionUrl(code));
        }

        [HttpGet("CurrentUser")]
        public ActionResult<object> GetCurrentUser()
        {
            var mediaUserGuid = ControllerUserGuid();
            return Ok(new
            {
                id = CurrentUserId,
                name = CurrentUserId,
                mediaUserId = mediaUserGuid == Guid.Empty ? CurrentUserId : mediaUserGuid.ToString("D")
            });
        }

        [HttpGet("Settings")]
        public ActionResult<object> GetSettings()
        {
            var config = Plugin.Instance?.Configuration;
            return Ok(new
            {
                publicJellyfinUrl = NormalizeBaseUrl(config?.PublicJellyfinUrl),
                serverUrl = RequestServerUrl(),
                publicCompanionUrl = NormalizeBaseUrl(config?.PublicCompanionUrl),
                enabledLibraryIds = config?.EnabledLibraryIds ?? new List<string>(),
                allowQueueVotingByDefault = config?.AllowQueueVotingByDefault ?? true,
                allowParticipantQueueAdds = config?.AllowParticipantQueueAdds ?? true,
                allowParticipantInvitesByDefault = config?.AllowParticipantInvitesByDefault ?? true,
                allowAndroidTvPlaybackTargets = config?.AllowAndroidTvPlaybackTargets ?? true,
                persistRoomHistory = config?.PersistRoomHistory ?? true,
                defaultInviteExpirationHours = config?.DefaultInviteExpirationHours ?? 24,
                pluginVersion = PluginVersion(),
                changelog = ChangelogEntries(),
                canSavePublicAccessSettings = IsElevatedUser()
            });
        }

        [HttpPost("Settings")]
        [Authorize(Policy = Policies.RequiresElevation)]
        public ActionResult SaveSettings([FromBody] CompanionSettingsRequest request)
        {
            if (request == null) return BadRequest("Settings payload is required.");

            var publicJellyfinUrl = NormalizeBaseUrl(request.PublicJellyfinUrl);
            var publicCompanionUrl = NormalizeBaseUrl(request.PublicCompanionUrl);
            if (string.IsNullOrEmpty(publicCompanionUrl) && !string.IsNullOrEmpty(publicJellyfinUrl))
            {
                publicCompanionUrl = $"{publicJellyfinUrl}/jelltogether/Companion";
            }

            if (!IsValidPublicUrl(publicJellyfinUrl)) return BadRequest("Public Jellyfin URL must be a valid HTTPS URL, or HTTP for localhost/private network testing.");
            if (!IsValidPublicUrl(publicCompanionUrl)) return BadRequest("Public companion URL must be a valid HTTPS URL, or HTTP for localhost/private network testing.");

            var plugin = Plugin.Instance;
            if (plugin == null) return StatusCode(500, "Plugin not initialized.");

            var config = plugin.Configuration;
            config.PublicJellyfinUrl = publicJellyfinUrl;
            config.PublicCompanionUrl = publicCompanionUrl;
            plugin.SaveConfiguration(config);
            return Ok();
        }

        [HttpGet("GlobalSettings")]
        [Authorize(Policy = Policies.RequiresElevation)]
        public ActionResult<object> GetGlobalSettings()
        {
            var config = Plugin.Instance?.Configuration;
            return Ok(new
            {
                publicJellyfinUrl = NormalizeBaseUrl(config?.PublicJellyfinUrl),
                publicCompanionUrl = NormalizeBaseUrl(config?.PublicCompanionUrl),
                enabledLibraryIds = config?.EnabledLibraryIds ?? new List<string>(),
                allowQueueVotingByDefault = config?.AllowQueueVotingByDefault ?? true,
                allowParticipantQueueAdds = config?.AllowParticipantQueueAdds ?? true,
                allowParticipantInvitesByDefault = config?.AllowParticipantInvitesByDefault ?? true,
                allowAndroidTvPlaybackTargets = config?.AllowAndroidTvPlaybackTargets ?? true,
                persistRoomHistory = config?.PersistRoomHistory ?? true,
                defaultInviteExpirationHours = config?.DefaultInviteExpirationHours ?? 24,
                discordStageId = config?.DiscordStageId ?? string.Empty,
                hasDiscordBotToken = !string.IsNullOrWhiteSpace(EffectiveDiscordBotToken(config)),
                discordBotTokenSource = IsDiscordBotTokenFromEnvironment() ? "environment" : "configuration",
                pluginVersion = PluginVersion(),
                changelog = ChangelogEntries()
            });
        }

        [HttpPost("GlobalSettings")]
        [Authorize(Policy = Policies.RequiresElevation)]
        public ActionResult SaveGlobalSettings([FromBody] GlobalSettingsRequest request)
        {
            if (request == null) return BadRequest("Settings payload is required.");

            var publicJellyfinUrl = NormalizeBaseUrl(request.PublicJellyfinUrl);
            var publicCompanionUrl = NormalizeBaseUrl(request.PublicCompanionUrl);
            if (string.IsNullOrEmpty(publicCompanionUrl) && !string.IsNullOrEmpty(publicJellyfinUrl))
            {
                publicCompanionUrl = $"{publicJellyfinUrl}/jelltogether/Companion";
            }

            if (!IsValidPublicUrl(publicJellyfinUrl)) return BadRequest("Public Jellyfin URL must be a valid HTTPS URL, or HTTP for localhost/private network testing.");
            if (!IsValidPublicUrl(publicCompanionUrl)) return BadRequest("Public companion URL must be a valid HTTPS URL, or HTTP for localhost/private network testing.");

            var plugin = Plugin.Instance;
            if (plugin == null) return StatusCode(500, "Plugin not initialized.");

            var config = plugin.Configuration;
            config.PublicJellyfinUrl = publicJellyfinUrl;
            config.PublicCompanionUrl = publicCompanionUrl;
            config.EnabledLibraryIds = request.EnabledLibraryIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
            config.AllowQueueVotingByDefault = request.AllowQueueVotingByDefault;
            config.AllowParticipantQueueAdds = request.AllowParticipantQueueAdds;
            config.AllowParticipantInvitesByDefault = request.AllowParticipantInvitesByDefault;
            config.AllowAndroidTvPlaybackTargets = request.AllowAndroidTvPlaybackTargets;
            config.PersistRoomHistory = request.PersistRoomHistory;
            config.DefaultInviteExpirationHours = Math.Clamp(request.DefaultInviteExpirationHours, 0, 24 * 30);
            config.DiscordStageId = TrimToLimit(request.DiscordStageId, 64);
            if (IsDiscordBotTokenFromEnvironment())
            {
                // Server-provided secrets intentionally override UI-managed token changes.
            }
            else if (request.ClearDiscordBotToken)
            {
                config.DiscordBotToken = string.Empty;
            }
            else if (!string.IsNullOrWhiteSpace(request.DiscordBotToken))
            {
                config.DiscordBotToken = TrimToLimit(request.DiscordBotToken, 256);
            }
            plugin.SaveConfiguration(config);
            return Ok();
        }

        [HttpGet("Discord/StageChannels")]
        [Authorize(Policy = Policies.RequiresElevation)]
        public async Task<ActionResult<object>> GetDiscordStageChannels()
        {
            var token = EffectiveDiscordBotToken(Plugin.Instance?.Configuration);
            if (string.IsNullOrWhiteSpace(token))
            {
                return Ok(new
                {
                    hasBotToken = false,
                    channels = Array.Empty<DiscordStageChannelOption>()
                });
            }

            try
            {
                var guilds = await GetDiscordArray("https://discord.com/api/v10/users/@me/guilds", token);
                var channels = new List<DiscordStageChannelOption>();

                foreach (var guild in guilds)
                {
                    var guildId = GetJsonString(guild, "id");
                    if (string.IsNullOrWhiteSpace(guildId)) continue;

                    var guildName = GetJsonString(guild, "name") ?? "Discord server";
                    try
                    {
                        var guildChannels = await GetDiscordArray($"https://discord.com/api/v10/guilds/{Uri.EscapeDataString(guildId)}/channels", token);
                        channels.AddRange(guildChannels
                            .Where(channel => GetJsonInt(channel, "type") == 13)
                            .Select(channel => new DiscordStageChannelOption
                            {
                                Id = GetJsonString(channel, "id") ?? string.Empty,
                                Name = GetJsonString(channel, "name") ?? "Stage channel",
                                GuildId = guildId,
                                GuildName = guildName
                            })
                            .Where(channel => !string.IsNullOrWhiteSpace(channel.Id)));
                    }
                    catch
                    {
                        // The bot can be in a guild without enough permission to inspect channels there.
                    }
                }

                return Ok(new
                {
                    hasBotToken = true,
                    channels = channels
                        .OrderBy(channel => channel.GuildName)
                        .ThenBy(channel => channel.Name)
                        .ToList()
                });
            }
            catch
            {
                return BadRequest("Saved Discord bot token could not be used to load Stage channels.");
            }
        }

        [HttpPost("Discord/TestStage")]
        [Authorize(Policy = Policies.RequiresElevation)]
        public async Task<ActionResult<DiscordStageTestResult>> TestDiscordStage([FromBody] DiscordStageTestRequest? request)
        {
            var config = Plugin.Instance?.Configuration;
            var token = string.IsNullOrWhiteSpace(request?.DiscordBotToken)
                ? EffectiveDiscordBotToken(config)
                : request.DiscordBotToken;
            var stageId = string.IsNullOrWhiteSpace(request?.DiscordStageId)
                ? config?.DiscordStageId
                : request.DiscordStageId;

            var result = new DiscordStageTestResult
            {
                ChannelId = TrimToLimit(stageId ?? string.Empty, 64)
            };

            if (string.IsNullOrWhiteSpace(token))
            {
                result.Status = "A Discord bot token is required.";
                return BadRequest(result);
            }

            if (string.IsNullOrWhiteSpace(stageId))
            {
                result.Status = "A Discord Stage channel ID is required.";
                return BadRequest(result);
            }

            try
            {
                var channel = await GetDiscordObject($"https://discord.com/api/v10/channels/{Uri.EscapeDataString(TrimToLimit(stageId, 64))}", token);
                result.Checks.Add("Bot token can read the channel.");
                result.ChannelName = GetJsonString(channel, "name") ?? "Stage channel";
                result.GuildId = GetJsonString(channel, "guild_id") ?? string.Empty;
                result.GuildName = await DiscordGuildName(result.GuildId, token);

                if (GetJsonInt(channel, "type") != 13)
                {
                    result.Status = "The selected Discord channel is not a Stage channel.";
                    return BadRequest(result);
                }

                result.Checks.Add("Selected channel is a Discord Stage channel.");
                var stageInstance = await TryGetDiscordObject($"https://discord.com/api/v10/stage-instances/{Uri.EscapeDataString(TrimToLimit(stageId, 64))}", token);
                if (stageInstance == null)
                {
                    result.Success = true;
                    result.Status = "Discord Stage channel is valid. Start the Stage in Discord before syncing the topic.";
                    result.Checks.Add("No live Stage instance is currently running.");
                    return Ok(result);
                }

                var currentTopic = GetJsonString(stageInstance.Value, "topic");
                if (!string.IsNullOrWhiteSpace(currentTopic))
                {
                    await PatchDiscordObject($"https://discord.com/api/v10/stage-instances/{Uri.EscapeDataString(TrimToLimit(stageId, 64))}", token, new { topic = TrimToLimit(currentTopic, 120) });
                    result.Checks.Add("Bot can manage the live Stage topic.");
                }
                result.Success = true;
                result.Status = "Discord Stage connection is ready.";
                return Ok(result);
            }
            catch (Exception ex)
            {
                result.Status = $"Discord check failed: {ex.Message}";
                return BadRequest(result);
            }
        }

        [HttpPost("Rooms")]
        public ActionResult<JellTogetherRoom> CreateRoom([FromBody] string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return BadRequest("Room name is required.");
            var room = _roomManager.CreateRoom(name, CurrentUserId);
            return Ok(RoomForUser(room));
        }

        [HttpGet("Rooms")]
        public ActionResult<IEnumerable<JellTogetherRoom>> GetRooms()
        {
            var rooms = _roomManager.GetAllRooms()
                .Where(r => !r.IsPrivate)
                .Select(RoomForUser)
                .ToList();
            return Ok(rooms);
        }

        [HttpGet("Rooms/ByCode/{code}")]
        public ActionResult<object> GetRoomByCode(string code)
        {
            if (string.IsNullOrWhiteSpace(code)) return BadRequest("Room code is required.");

            var room = _roomManager.GetRoomByCode(code);
            if (room == null) return NotFound();
            return Ok(new
            {
                id = room.Id,
                name = room.Name,
                roomCode = room.RoomCode,
                isPrivate = room.IsPrivate,
                participantCount = room.Participants.Count
            });
        }

        [HttpPost("Rooms/{roomId}/TogglePrivacy")]
        public ActionResult TogglePrivacy(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var callerId = CurrentUserId;
            if (room.OwnerId != callerId) return Forbid();

            _roomManager.TogglePrivacy(roomId);
            return Ok();
        }

        [HttpGet("Rooms/{roomId}")]
        public ActionResult<JellTogetherRoom> GetRoom(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanView(room)) return Forbid();
            return Ok(RoomForUser(room));
        }

        [HttpPost("Rooms/{roomId}/Rename")]
        public ActionResult RenameRoom(string roomId, [FromBody] string name)
        {
            if (string.IsNullOrWhiteSpace(name)) return BadRequest("Room name is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();

            return _roomManager.RenameRoom(roomId, name) ? Ok() : BadRequest("Unable to rename room.");
        }

        [HttpDelete("Rooms/{roomId}")]
        public ActionResult DeleteRoom(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (room.OwnerId != CurrentUserId) return Forbid();

            return _roomManager.DeleteRoom(roomId) ? Ok() : NotFound();
        }

        [HttpPost("Rooms/{roomId}/Join")]
        public ActionResult JoinRoom(string roomId, [FromQuery] string? code = null)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var result = _roomManager.JoinRoom(roomId, CurrentUserId, code);
            return result switch
            {
                JoinRoomResult.Joined => Ok(new { status = "joined" }),
                JoinRoomResult.PendingApproval => Accepted(new { status = "pending" }),
                JoinRoomResult.Locked => StatusCode(423, "Room joining is locked."),
                JoinRoomResult.Banned => Forbid(),
                JoinRoomResult.Forbidden => Forbid(),
                JoinRoomResult.NotFound => NotFound(),
                _ => Forbid()
            };
        }

        [HttpPost("Rooms/{roomId}/Queue")]
        public ActionResult AddToQueue(string roomId, [FromBody] JsonElement payload)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            if (!CanAddToQueue(room)) return Forbid();

            var request = ParseQueueItemRequest(payload);
            var allowedLibraryIds = Plugin.Instance?.Configuration.EnabledLibraryIds ?? new List<string>();
            if (!string.IsNullOrWhiteSpace(request.LibraryId) &&
                allowedLibraryIds.Count > 0 &&
                !allowedLibraryIds.Contains(request.LibraryId, StringComparer.OrdinalIgnoreCase))
            {
                return Forbid();
            }

            var title = request.Title;
            if (string.IsNullOrWhiteSpace(title)) return BadRequest("Queue title is required.");
            return _roomManager.AddToQueue(roomId, title, CurrentUserId, request.MediaId, request.LibraryId, request.MediaType, request.Overview)
                ? Ok()
                : Forbid();
        }

        [HttpPost("Rooms/{roomId}/Queue/{itemId}/Vote")]
        public ActionResult ToggleQueueVote(string roomId, string itemId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            return _roomManager.ToggleQueueVote(roomId, itemId, CurrentUserId) ? Ok() : Forbid();
        }

        [HttpPost("Rooms/{roomId}/Queue/{itemId}/Move")]
        public ActionResult MoveQueueItem(string roomId, string itemId, [FromBody] int direction)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();

            return _roomManager.MoveQueueItem(roomId, itemId, direction, CurrentUserId) ? Ok() : BadRequest("Unable to move queue item.");
        }

        [HttpDelete("Rooms/{roomId}/Queue")]
        public ActionResult ClearQueue(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();

            return _roomManager.ClearQueue(roomId, CurrentUserId) ? Ok() : BadRequest("Unable to clear queue.");
        }

        [HttpDelete("Rooms/{roomId}/Queue/{itemId}")]
        public ActionResult RemoveQueueItem(string roomId, string itemId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            return _roomManager.RemoveQueueItem(roomId, itemId, CurrentUserId) ? Ok() : Forbid();
        }

        [HttpGet("Rooms/{roomId}/PlaybackTargets")]
        public ActionResult<List<PlaybackTargetDto>> GetPlaybackTargets(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanView(room)) return Forbid();

            return Ok(PlaybackTargetsForRoom(room));
        }

        [HttpPost("Rooms/{roomId}/Queue/{itemId}/Start")]
        public async Task<ActionResult<StartWatchPartyResult>> StartWatchParty(string roomId, string itemId, [FromBody] StartWatchPartyRequest? request, CancellationToken cancellationToken)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanControlPlayback(room)) return Forbid();

            var item = room.Queue.FirstOrDefault(queueItem => queueItem.Id == itemId);
            if (item == null) return NotFound();
            if (!Guid.TryParse(item.MediaId, out var mediaId)) return BadRequest("Queue item is not linked to a playable Jellyfin item.");

            var availableTargets = PlaybackTargetsForRoom(room);
            var targets = availableTargets
                .Where(target => target.CanStartPlayback)
                .ToList();

            var requestedSessionIds = request?.TargetSessionIds?.Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? new();
            if (requestedSessionIds.Count > 0)
            {
                targets = targets.Where(target => requestedSessionIds.Contains(target.SessionId)).ToList();
            }

            if (targets.Count == 0)
            {
                var noTargetsResult = new StartWatchPartyResult
                {
                    Title = item.Title,
                    EligibleCount = 0,
                    StartedCount = 0,
                    AvailableTargets = availableTargets
                };
                return BadRequest(CanManage(room) ? noTargetsResult : RedactPlaybackDiagnostics(noTargetsResult));
            }

            var controllingSessionId = ControllerSessionId();
            var controllingUserId = ControllerUserGuid();
            var playRequest = new PlayRequest
            {
                ItemIds = new[] { mediaId },
                PlayCommand = PlayCommand.PlayNow,
                ControllingUserId = controllingUserId
            };

            var attempts = new List<PlaybackStartAttempt>();
            foreach (var target in targets)
            {
                var attempt = new PlaybackStartAttempt
                {
                    SessionId = target.SessionId,
                    UserName = target.UserName,
                    Client = target.Client,
                    DeviceName = target.DeviceName
                };

                try
                {
                    await _sessionManager.SendPlayCommand(controllingSessionId, target.SessionId, playRequest, cancellationToken).ConfigureAwait(false);
                    attempt.Success = true;
                    attempt.Status = "Command sent";
                }
                catch (Exception ex)
                {
                    attempt.Success = false;
                    attempt.Status = "Command failed";
                    attempt.Error = ex.Message;
                }

                attempts.Add(attempt);
            }

            var failed = attempts.Where(attempt => !attempt.Success).Select(attempt => attempt.SessionId).ToList();
            if (failed.Count < targets.Count)
            {
                _roomManager.MarkNowPlaying(roomId, item);
            }

            var result = new StartWatchPartyResult
            {
                Title = item.Title,
                EligibleCount = targets.Count,
                StartedCount = targets.Count - failed.Count,
                FailedSessionIds = failed,
                ControllingSessionId = controllingSessionId,
                ControllingUserId = controllingUserId.ToString(),
                Attempts = attempts,
                AvailableTargets = availableTargets
            };

            return Ok(CanManage(room) ? result : RedactPlaybackDiagnostics(result));
        }

        [HttpPost("Rooms/{roomId}/Theories")]
        public ActionResult AddTheory(string roomId, [FromBody] string text)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            if (string.IsNullOrWhiteSpace(text)) return BadRequest("Theory text is required.");
            _roomManager.AddTheory(roomId, text, CurrentUserId);
            return Ok();
        }

        [HttpDelete("Rooms/{roomId}/Theories/{theoryId}")]
        public ActionResult RemoveTheory(string roomId, string theoryId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            return _roomManager.RemoveTheory(roomId, theoryId, CurrentUserId) ? Ok() : Forbid();
        }

        [HttpPost("Rooms/{roomId}/Reactions")]
        public ActionResult SendReaction(string roomId, [FromBody] string emoji)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            if (string.IsNullOrWhiteSpace(emoji)) return BadRequest("Reaction is required.");
            _roomManager.AddReaction(roomId, emoji, CurrentUserId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Trivia")]
        public ActionResult StartTrivia(string roomId, [FromBody] TriviaQuestion question)
        {
            if (question == null) return BadRequest("Trivia payload is required.");
            if (string.IsNullOrWhiteSpace(question.Question)) return BadRequest("Trivia question is required.");
            if (question.Options == null) return BadRequest("Trivia options are required.");
            if (question.Options.Count(o => !string.IsNullOrWhiteSpace(o)) < 2) return BadRequest("Trivia requires at least two options.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();
            _roomManager.AddTrivia(roomId, question);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Invitations")]
        public ActionResult<JellTogetherInvite> CreateInvite(string roomId, [FromBody] CreateInviteRequest request)
        {
            if (request == null) return BadRequest("Invite payload is required.");
            if (request.HoursValid < 0) return BadRequest("Invite expiration cannot be negative.");
            if (request.MaxUses < 0) return BadRequest("Invite use limit cannot be negative.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var isAdmin = CanManage(room);
            
            if (!isAdmin && !room.AllowParticipantInvites) return Forbid();

            var perms = new ParticipantPermissions
            {
                CanChat = request.CanChat,
                CanControlPlayback = request.CanControl,
                CanAddToQueue = request.CanAddToQueue
            };
            var invite = _roomManager.CreateInvite(roomId, CurrentUserId, perms, request.HoursValid, request.MaxUses);
            return Ok(invite);
        }

        [HttpPost("Rooms/{roomId}/ToggleParticipantInvites")]
        public ActionResult ToggleParticipantInvites(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (room.OwnerId != CurrentUserId) return Forbid();

            _roomManager.ToggleParticipantInvites(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/ToggleJoinApproval")]
        public ActionResult ToggleJoinApproval(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();

            _roomManager.ToggleJoinApproval(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/ToggleJoinLock")]
        public ActionResult ToggleJoinLock(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();

            _roomManager.ToggleJoinLock(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/ToggleQueueVoting")]
        public ActionResult ToggleQueueVoting(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (room.OwnerId != CurrentUserId) return Forbid();

            _roomManager.ToggleQueueVoting(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Leave")]
        public ActionResult LeaveRoom(string roomId)
        {
            _roomManager.LeaveRoom(roomId, CurrentUserId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Seats/{seatIndex:int}")]
        public ActionResult MoveSeat(string roomId, int seatIndex)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            return _roomManager.MoveSeat(roomId, CurrentUserId, seatIndex) ? Ok() : BadRequest("Seat is not available.");
        }

        [HttpGet("Rooms/{roomId}/Updates")]
        public ActionResult<JellTogetherRoom> GetRoomUpdates(string roomId, [FromQuery] DateTime since)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanView(room)) return Forbid();
            
            if (room.LastUpdated <= since)
            {
                return StatusCode(304);
            }

            return Ok(RoomForUser(room));
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Permissions")]
        public ActionResult SetPermissions(string roomId, string userId, [FromBody] ParticipantPermissions permissions)
        {
            if (permissions == null) return BadRequest("Permissions payload is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = CurrentUserId;
            if (room.OwnerId != callerId && !room.CoHostIds.Contains(callerId))
            {
                return Forbid();
            }

            if (room.OwnerId != callerId)
            {
                var existingPermissions = room.Permissions.TryGetValue(userId, out var existing)
                    ? existing
                    : new ParticipantPermissions();
                permissions.CanManageParticipants = existingPermissions.CanManageParticipants;
            }

            _roomManager.SetUserPermissions(roomId, userId, permissions.CanChat, permissions.CanControlPlayback, permissions.CanAddToQueue, permissions.CanManageParticipants);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Approve")]
        public ActionResult ApproveJoin(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();
            return _roomManager.ApproveJoin(roomId, userId) ? Ok() : BadRequest("Unable to approve participant.");
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Reject")]
        public ActionResult RejectJoin(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();
            return _roomManager.RejectJoin(roomId, userId) ? Ok() : BadRequest("Unable to reject participant.");
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Kick")]
        public ActionResult KickParticipant(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();
            return _roomManager.KickParticipant(roomId, userId) ? Ok() : BadRequest("Unable to remove participant.");
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Ban")]
        public ActionResult BanParticipant(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();
            return _roomManager.BanParticipant(roomId, userId) ? Ok() : BadRequest("Unable to ban participant.");
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Unban")]
        public ActionResult UnbanParticipant(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManageParticipants(room)) return Forbid();
            return _roomManager.UnbanParticipant(roomId, userId) ? Ok() : BadRequest("Unable to unban participant.");
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Promote")]
        public ActionResult TogglePromote(string roomId, string userId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = CurrentUserId;
            // Only Owner can promote/demote co-hosts
            if (room.OwnerId != callerId)
            {
                return Forbid();
            }

            _roomManager.ToggleCoHost(roomId, userId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/TransferOwnership")]
        public ActionResult TransferOwnership(string roomId, [FromBody] string newOwnerId)
        {
            if (string.IsNullOrWhiteSpace(newOwnerId)) return BadRequest("New owner id is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = CurrentUserId;
            // Only current Owner can transfer ownership
            if (room.OwnerId != callerId)
            {
                return Forbid();
            }

            _roomManager.TransferOwnership(roomId, newOwnerId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Polls")]
        public ActionResult CreatePoll(string roomId, [FromBody] CreatePollRequest request)
        {
            if (request == null) return BadRequest("Poll payload is required.");
            if (string.IsNullOrWhiteSpace(request.Question)) return BadRequest("Poll question is required.");
            if (request.Options == null) return BadRequest("Poll options are required.");
            if (request.Options.Count(o => !string.IsNullOrWhiteSpace(o)) < 2) return BadRequest("Poll requires at least two options.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!CanManage(room)) return Forbid();

            _roomManager.CreatePoll(roomId, request.Question, request.Options);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Polls/{pollId}/Vote")]
        public ActionResult Vote(string roomId, string pollId, [FromBody] string option)
        {
            if (string.IsNullOrWhiteSpace(option)) return BadRequest("Poll option is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            _roomManager.Vote(roomId, pollId, CurrentUserId, option);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Webhook")]
        public ActionResult SetWebhook(string roomId, [FromBody] string url)
        {
            if (string.IsNullOrWhiteSpace(url)) return BadRequest("Webhook URL is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (room.OwnerId != CurrentUserId) return Forbid();

            if (!_roomManager.SetWebhook(roomId, url)) return BadRequest("Only Discord webhook URLs are allowed.");
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Theme")]
        public ActionResult SetTheme(string roomId, [FromBody] string theme)
        {
            if (string.IsNullOrWhiteSpace(theme)) return BadRequest("Theme is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!CanManage(room)) return Forbid();

            _roomManager.SetTheme(roomId, theme);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Buffering")]
        public ActionResult SetBuffering(string roomId, [FromBody] bool isBuffering)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            _roomManager.SetBuffering(roomId, CurrentUserId, isBuffering);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/ToggleControl")]
        public ActionResult ToggleControl(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (room.OwnerId != CurrentUserId) return Forbid();

            _roomManager.ToggleHostControl(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Messages")]
        public ActionResult AddMessage(string roomId, [FromBody] JsonElement payload)
        {
            var request = ParseChatMessageRequest(payload);
            var text = request.Text;
            if (string.IsNullOrWhiteSpace(text)) return BadRequest("Message text is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            var replyTo = string.IsNullOrWhiteSpace(request.ReplyToMessageId)
                ? null
                : room.Messages.FirstOrDefault(m => m.Id == request.ReplyToMessageId);

            var message = new ChatMessage
            {
                UserId = CurrentUserId,
                UserName = CurrentUserId,
                Text = text,
                ReplyToMessageId = replyTo?.Id ?? string.Empty,
                ReplyToUserName = replyTo?.UserName ?? string.Empty,
                ReplyToText = TrimToLimit(replyTo?.Text ?? string.Empty, 140),
                Mentions = ExtractMentions(text, room.Participants)
            };

            if (!_roomManager.AddMessage(roomId, message)) return Forbid();
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Messages/{messageId}/Reactions")]
        public ActionResult ToggleMessageReaction(string roomId, string messageId, [FromBody] string emoji)
        {
            if (string.IsNullOrWhiteSpace(emoji)) return BadRequest("Reaction is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            return _roomManager.ToggleMessageReaction(roomId, messageId, CurrentUserId, emoji) ? Ok() : BadRequest("Unable to update reaction.");
        }
        [HttpGet("Rooms/{roomId}/Recap")]
        public ActionResult<RoomStats> GetRecap(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanView(room)) return Forbid();
            return Ok(room.Stats);
        }

        [HttpPost("Rooms/{roomId}/SyncStage")]
        public async Task<ActionResult> SyncStage(string roomId, [FromBody] SyncDiscordStageRequest request)
        {
            var title = request?.Title ?? string.Empty;
            if (string.IsNullOrWhiteSpace(title)) return BadRequest("Discord stage title is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();

            var config = Plugin.Instance?.Configuration;
            var updated = await _roomManager.UpdateDiscordStage(
                roomId,
                title,
                EffectiveDiscordBotToken(config),
                config?.DiscordStageId);
            return updated ? Ok() : BadRequest("Discord Stage is not configured in global settings.");
        }

        private bool CanView(JellTogetherRoom room)
        {
            return !room.IsPrivate ||
                room.Participants.Contains(CurrentUserId) ||
                room.OwnerId == CurrentUserId ||
                room.CoHostIds.Contains(CurrentUserId);
        }

        private bool CanManage(JellTogetherRoom room)
        {
            return room.OwnerId == CurrentUserId || room.CoHostIds.Contains(CurrentUserId);
        }

        private bool CanManageParticipants(JellTogetherRoom room)
        {
            if (CanManage(room)) return true;
            return room.Permissions.TryGetValue(CurrentUserId, out var permissions) &&
                permissions.CanManageParticipants;
        }

        private bool CanControlPlayback(JellTogetherRoom room)
        {
            if (CanManage(room)) return true;
            if (!room.Participants.Contains(CurrentUserId) || room.IsHostOnlyControl) return false;
            return !room.Permissions.TryGetValue(CurrentUserId, out var permissions) ||
                permissions.CanControlPlayback;
        }

        private bool CanAddToQueue(JellTogetherRoom room)
        {
            if (CanManage(room)) return true;
            if (!room.Participants.Contains(CurrentUserId)) return false;
            if (Plugin.Instance?.Configuration.AllowParticipantQueueAdds == false) return false;
            return !room.Permissions.TryGetValue(CurrentUserId, out var permissions) ||
                permissions.CanAddToQueue;
        }

        private static StartWatchPartyResult RedactPlaybackDiagnostics(StartWatchPartyResult result)
        {
            result.ControllingSessionId = string.Empty;
            result.ControllingUserId = string.Empty;
            result.FailedSessionIds = new List<string>();
            result.Attempts = result.Attempts
                .Select(attempt => new PlaybackStartAttempt
                {
                    Success = attempt.Success,
                    Status = attempt.Status
                })
                .ToList();
            result.AvailableTargets = result.AvailableTargets
                .Select(target => new PlaybackTargetDto
                {
                    IsActive = target.IsActive,
                    SupportsRemoteControl = target.SupportsRemoteControl,
                    SupportsMediaControl = target.SupportsMediaControl,
                    IsAndroidTv = target.IsAndroidTv,
                    CanStartPlayback = target.CanStartPlayback,
                    EligibilityReason = target.EligibilityReason
                })
                .ToList();
            return result;
        }

        private static string EffectiveDiscordBotToken(JellTogether.Plugin.Configuration.PluginConfiguration? config)
        {
            var environmentToken = Environment.GetEnvironmentVariable("JELLTOGETHER_DISCORD_BOT_TOKEN");
            return !string.IsNullOrWhiteSpace(environmentToken)
                ? TrimToLimit(environmentToken, 256)
                : TrimToLimit(config?.DiscordBotToken ?? string.Empty, 256);
        }

        private static bool IsDiscordBotTokenFromEnvironment()
        {
            return !string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("JELLTOGETHER_DISCORD_BOT_TOKEN"));
        }

        private JellTogetherRoom RoomForUser(JellTogetherRoom room)
        {
            room.DiscordBotToken = null;
            room.ParticipantProfiles = ParticipantProfilesForRoom(room);

            if (room.OwnerId != CurrentUserId && !room.CoHostIds.Contains(CurrentUserId))
            {
                room.DiscordWebhookUrl = null;
                room.Invitations = new List<JellTogetherInvite>();
            }

            return room;
        }

        private Dictionary<string, ParticipantProfile> ParticipantProfilesForRoom(JellTogetherRoom room)
        {
            return room.Participants
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    participant => participant,
                    participant =>
                    {
                        var session = _sessionManager.Sessions.FirstOrDefault(activeSession => SessionMatchesUser(activeSession, participant));
                        return new ParticipantProfile
                        {
                            UserId = participant,
                            DisplayName = session?.UserName ?? participant,
                            MediaUserId = session?.UserId.ToString("D") ?? (Guid.TryParse(participant, out var participantGuid) ? participantGuid.ToString("D") : string.Empty)
                        };
                    },
                    StringComparer.OrdinalIgnoreCase);
        }

        private List<PlaybackTargetDto> PlaybackTargetsForRoom(JellTogetherRoom room)
        {
            return _sessionManager.Sessions
                .Where(session => SessionBelongsToRoomParticipant(session, room))
                .Select(session =>
                {
                    var isAndroidTv = IsAndroidTvSession(session);
                    var allowAndroidTv = Plugin.Instance?.Configuration.AllowAndroidTvPlaybackTargets ?? true;
                    var canStartPlayback = CanStartPlayback(session, isAndroidTv, allowAndroidTv);
                    return new PlaybackTargetDto
                    {
                        SessionId = session.Id,
                        UserId = session.UserId.ToString("D"),
                        UserName = session.UserName,
                        Client = session.Client,
                        DeviceName = session.DeviceName,
                        IsActive = session.IsActive,
                        SupportsRemoteControl = session.SupportsRemoteControl,
                        SupportsMediaControl = session.SupportsMediaControl,
                        IsCurrentUser = SessionMatchesCurrentUser(session),
                        IsAndroidTv = isAndroidTv,
                        CanStartPlayback = canStartPlayback,
                        EligibilityReason = PlaybackEligibilityReason(session, isAndroidTv, allowAndroidTv, canStartPlayback)
                    };
                })
                .OrderByDescending(target => target.IsCurrentUser)
                .ThenByDescending(target => target.CanStartPlayback)
                .ThenByDescending(target => target.IsAndroidTv)
                .ThenBy(target => target.UserName)
                .ThenBy(target => target.DeviceName)
                .ToList();
        }

        private static bool CanStartPlayback(SessionInfo session, bool isAndroidTv, bool allowAndroidTv)
        {
            if (!session.IsActive) return false;
            if (session.SupportsRemoteControl && session.SupportsMediaControl) return true;
            return allowAndroidTv && isAndroidTv && session.SupportsRemoteControl;
        }

        private static string PlaybackEligibilityReason(SessionInfo session, bool isAndroidTv, bool allowAndroidTv, bool canStartPlayback)
        {
            if (canStartPlayback && isAndroidTv && !session.SupportsMediaControl)
            {
                return "Android TV remote-start mode";
            }

            if (canStartPlayback) return "Ready";
            if (!session.IsActive) return "Inactive";
            if (isAndroidTv && !allowAndroidTv) return "Android TV targeting disabled";
            if (!session.SupportsRemoteControl) return "Remote control unavailable";
            if (!session.SupportsMediaControl) return "Media control unavailable";
            return "Unavailable";
        }

        private static bool IsAndroidTvSession(SessionInfo session)
        {
            var client = session.Client ?? string.Empty;
            var device = session.DeviceName ?? string.Empty;
            var text = $"{client} {device}";
            return text.Contains("Android TV", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("Jellyfin TV", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("Google TV", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("NVIDIA SHIELD", StringComparison.OrdinalIgnoreCase) ||
                text.Contains("Shield Android TV", StringComparison.OrdinalIgnoreCase);
        }

        private bool SessionBelongsToRoomParticipant(SessionInfo session, JellTogetherRoom room)
        {
            return room.Participants.Any(participant => SessionMatchesUser(session, participant));
        }

        private bool SessionMatchesCurrentUser(SessionInfo session)
        {
            return SessionMatchesUser(session, CurrentUserId);
        }

        private static bool SessionMatchesUser(SessionInfo session, string userId)
        {
            if (string.IsNullOrWhiteSpace(userId)) return false;
            return session.UserName.Equals(userId, StringComparison.OrdinalIgnoreCase) ||
                session.UserId.ToString("D").Equals(userId, StringComparison.OrdinalIgnoreCase) ||
                session.UserId.ToString("N").Equals(userId, StringComparison.OrdinalIgnoreCase);
        }

        private string ControllerSessionId()
        {
            return _sessionManager.Sessions.FirstOrDefault(SessionMatchesCurrentUser)?.Id ?? string.Empty;
        }

        private Guid ControllerUserGuid()
        {
            var session = _sessionManager.Sessions.FirstOrDefault(SessionMatchesCurrentUser);
            if (session != null) return session.UserId;
            if (Guid.TryParse(CurrentUserId, out var userId)) return userId;
            return Guid.Empty;
        }

        private static QueueItemRequest ParseQueueItemRequest(JsonElement payload)
        {
            if (payload.ValueKind == JsonValueKind.String)
            {
                return new QueueItemRequest { Title = payload.GetString() ?? string.Empty };
            }

            if (payload.ValueKind != JsonValueKind.Object) return new QueueItemRequest();

            return new QueueItemRequest
            {
                Title = GetJsonString(payload, "title") ?? GetJsonString(payload, "Title") ?? string.Empty,
                MediaId = GetJsonString(payload, "mediaId") ?? GetJsonString(payload, "MediaId") ?? string.Empty,
                LibraryId = GetJsonString(payload, "libraryId") ?? GetJsonString(payload, "LibraryId") ?? string.Empty,
                MediaType = GetJsonString(payload, "mediaType") ?? GetJsonString(payload, "MediaType") ?? string.Empty,
                Overview = GetJsonString(payload, "overview") ?? GetJsonString(payload, "Overview") ?? string.Empty
            };
        }

        private static ChatMessageRequest ParseChatMessageRequest(JsonElement payload)
        {
            if (payload.ValueKind == JsonValueKind.String)
            {
                return new ChatMessageRequest { Text = payload.GetString() ?? string.Empty };
            }

            if (payload.ValueKind != JsonValueKind.Object) return new ChatMessageRequest();

            return new ChatMessageRequest
            {
                Text = GetJsonString(payload, "text") ?? GetJsonString(payload, "Text") ?? string.Empty,
                ReplyToMessageId = GetJsonString(payload, "replyToMessageId") ?? GetJsonString(payload, "ReplyToMessageId") ?? string.Empty
            };
        }

        private static List<string> ExtractMentions(string text, IEnumerable<string> participants)
        {
            var tokens = Regex.Matches(text, @"@([\w.\-]+)")
                .Select(match => match.Groups[1].Value)
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            return participants
                .Where(participant => tokens.Contains(participant) || tokens.Contains(participant.Split('@')[0]))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }

        private static string TrimToLimit(string value, int limit)
        {
            value = value?.Trim() ?? string.Empty;
            return value.Length <= limit ? value : value[..limit];
        }

        private static string? GetJsonString(JsonElement payload, string propertyName)
        {
            return payload.TryGetProperty(propertyName, out var value) && value.ValueKind == JsonValueKind.String
                ? value.GetString()
                : null;
        }

        private static int? GetJsonInt(JsonElement payload, string propertyName)
        {
            return payload.TryGetProperty(propertyName, out var value) &&
                value.ValueKind == JsonValueKind.Number &&
                value.TryGetInt32(out var result)
                    ? result
                    : null;
        }

        private static async Task<List<JsonElement>> GetDiscordArray(string url, string botToken)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");

            using var response = await DiscordHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException("Discord API request failed.");

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            if (document.RootElement.ValueKind != JsonValueKind.Array) return new List<JsonElement>();

            return document.RootElement.EnumerateArray()
                .Select(element => element.Clone())
                .ToList();
        }

        private static async Task<JsonElement> GetDiscordObject(string url, string botToken)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");

            using var response = await DiscordHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Discord API returned {(int)response.StatusCode}.");

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            if (document.RootElement.ValueKind != JsonValueKind.Object) throw new InvalidOperationException("Discord API did not return an object.");
            return document.RootElement.Clone();
        }

        private static async Task<JsonElement?> TryGetDiscordObject(string url, string botToken)
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, url);
            request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");

            using var response = await DiscordHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) return null;

            await using var stream = await response.Content.ReadAsStreamAsync();
            using var document = await JsonDocument.ParseAsync(stream);
            return document.RootElement.ValueKind == JsonValueKind.Object ? document.RootElement.Clone() : null;
        }

        private static async Task<string> DiscordGuildName(string guildId, string botToken)
        {
            if (string.IsNullOrWhiteSpace(guildId)) return string.Empty;

            try
            {
                var guild = await TryGetDiscordObject($"https://discord.com/api/v10/guilds/{Uri.EscapeDataString(guildId)}", botToken);
                return guild == null ? string.Empty : GetJsonString(guild.Value, "name") ?? string.Empty;
            }
            catch
            {
                return string.Empty;
            }
        }

        private static async Task PatchDiscordObject(string url, string botToken, object payload)
        {
            using var request = new HttpRequestMessage(HttpMethod.Patch, url);
            request.Headers.Add("Authorization", $"Bot {TrimToLimit(botToken, 256)}");
            request.Content = new StringContent(JsonSerializer.Serialize(payload), System.Text.Encoding.UTF8, "application/json");

            using var response = await DiscordHttpClient.SendAsync(request);
            if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Discord API returned {(int)response.StatusCode} while updating the channel.");
        }

        private IActionResult StandaloneCompanion(string? code = null)
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("JellTogether.Web.jelltogether.html");
            if (stream == null) return NotFound("JellTogether companion page was not found.");

            using var reader = new StreamReader(stream);
            var fragment = reader.ReadToEnd();

            var queryScript = string.IsNullOrWhiteSpace(code)
                ? string.Empty
                : $"<script>window.JELL_TOGETHER_INVITE_CODE = {System.Text.Json.JsonSerializer.Serialize(code.Trim())};</script>";
            var serverScript = $"<script>window.JELL_TOGETHER_SERVER_URL = {System.Text.Json.JsonSerializer.Serialize(RequestServerUrl())};</script>";

            var html = $@"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>JellTogether | Jellyfin Watch Party Companion</title>
    <link rel=""icon"" type=""image/png"" href=""configurationpage?name=favicon.png"">
    <link rel=""apple-touch-icon"" href=""configurationpage?name=icon-192.png"">
    <link rel=""manifest"" href=""configurationpage?name=manifest.json"">
    <meta name=""theme-color"" content=""#8c44f7"">
</head>
<body class=""jelltogether-standalone"">
{serverScript}
{queryScript}
{fragment}
</body>
</html>";

            var basePath = Request.PathBase.HasValue ? Request.PathBase.Value : string.Empty;
            var resourceBase = $"{basePath}/web/configurationpage?name=";
            html = html.Replace("configurationpage?name=", resourceBase, StringComparison.Ordinal);

            return Content(html, "text/html");
        }

        private string CompanionUrl(string? code = null)
        {
            var configuredCompanion = NormalizeBaseUrl(Plugin.Instance?.Configuration.PublicCompanionUrl);
            if (!string.IsNullOrEmpty(configuredCompanion))
            {
                return CompanionPageUrlFromConfiguredCompanion(configuredCompanion, code);
            }

            var configuredJellyfin = NormalizeBaseUrl(Plugin.Instance?.Configuration.PublicJellyfinUrl);
            if (!string.IsNullOrEmpty(configuredJellyfin))
            {
                return WebConfigurationPageUrl(configuredJellyfin, code);
            }

            var basePath = Request.PathBase.HasValue ? Request.PathBase.Value : string.Empty;
            return AddInviteCode($"{basePath}/jelltogether/Companion", code);
        }

        private static string NormalizeBaseUrl(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().TrimEnd('/');
        }

        private static bool IsValidPublicUrl(string value)
        {
            if (string.IsNullOrEmpty(value)) return true;
            if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
            if (uri.Scheme == Uri.UriSchemeHttps) return true;
            return uri.Scheme == Uri.UriSchemeHttp && IsLocalOrPrivateHost(uri.Host);
        }

        private static string AddInviteCode(string url, string? code)
        {
            if (string.IsNullOrWhiteSpace(code)) return url;
            return QueryHelpers.AddQueryString(url, "code", code.Trim());
        }

        private static string CompanionPageUrlFromConfiguredCompanion(string configuredCompanion, string? code)
        {
            if (!Uri.TryCreate(configuredCompanion, UriKind.Absolute, out var uri))
            {
                return AddInviteCode(configuredCompanion, code);
            }

            if (uri.AbsolutePath.StartsWith("/jelltogether/Invite/", StringComparison.OrdinalIgnoreCase))
            {
                return AddInviteCode($"{uri.GetLeftPart(UriPartial.Authority)}/jelltogether/Companion", code);
            }

            return AddInviteCode(configuredCompanion, code);
        }

        private static string WebConfigurationPageUrl(string baseUrl, string? code)
        {
            return AddInviteCode($"{NormalizeBaseUrl(baseUrl)}/jelltogether/Companion", code);
        }

        private string RequestServerUrl()
        {
            var scheme = Request.Scheme;
            if (Request.Headers.TryGetValue("X-Forwarded-Proto", out var proto) && !string.IsNullOrEmpty(proto))
            {
                scheme = proto.ToString();
            }
            var basePath = Request.PathBase.HasValue ? Request.PathBase.Value : string.Empty;
            return NormalizeBaseUrl($"{scheme}://{Request.Host}{basePath}");
        }

        private static string PluginVersion()
        {
            return typeof(Plugin).Assembly.GetName().Version?.ToString() ?? "0.0.0.0";
        }

        private static List<object> ChangelogEntries()
        {
            var markdown = ReadChangelogMarkdown();
            if (string.IsNullOrWhiteSpace(markdown)) return new List<object>();

            var entries = new List<object>();
            var currentVersion = PluginVersion();
            string date = string.Empty;
            string title = string.Empty;
            var items = new List<string>();

            void Flush()
            {
                if (string.IsNullOrWhiteSpace(title) && items.Count == 0) return;
                entries.Add(new
                {
                    version = entries.Count == 0 ? currentVersion : "Earlier",
                    date,
                    title,
                    items = items.ToArray()
                });
                items = new List<string>();
            }

            foreach (var rawLine in markdown.Split('\n'))
            {
                var line = rawLine.Trim();
                var heading = Regex.Match(line, @"^##\s+\[(?<date>[^\]]+)\]\s*-\s*(?<title>.+)$");
                if (heading.Success)
                {
                    Flush();
                    date = heading.Groups["date"].Value.Trim();
                    title = heading.Groups["title"].Value.Trim();
                    continue;
                }

                if (line.StartsWith("- ", StringComparison.Ordinal))
                {
                    items.Add(line[2..].Trim());
                }
            }

            Flush();
            return entries.Take(8).Cast<object>().ToList();
        }

        private static string ReadChangelogMarkdown()
        {
            var assembly = typeof(Plugin).Assembly;
            using var stream = assembly.GetManifestResourceStream("JellTogether.Plugin.CHANGELOG.md");
            if (stream == null) return string.Empty;
            using var reader = new StreamReader(stream);
            return reader.ReadToEnd();
        }

        private static bool IsLocalOrPrivateHost(string host)
        {
            return host.Equals("localhost", StringComparison.OrdinalIgnoreCase) ||
                host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
                host.Equals("::1", StringComparison.OrdinalIgnoreCase) ||
                host.StartsWith("10.", StringComparison.OrdinalIgnoreCase) ||
                host.StartsWith("192.168.", StringComparison.OrdinalIgnoreCase) ||
                IsPrivate172Host(host);
        }

        private static bool IsPrivate172Host(string host)
        {
            var parts = host.Split('.');
            return parts.Length == 4 &&
                parts[0] == "172" &&
                int.TryParse(parts[1], out var second) &&
                second >= 16 &&
                second <= 31;
        }

        private bool IsElevatedUser()
        {
            if (User.IsInRole("Administrator")) return true;

            return User.Claims.Any(claim =>
                IsTruthyAdminClaim(claim) ||
                claim.Value.Equals("Administrator", StringComparison.OrdinalIgnoreCase) ||
                claim.Value.Equals("RequiresElevation", StringComparison.OrdinalIgnoreCase));
        }

        private static bool IsTruthyAdminClaim(Claim claim)
        {
            var claimType = claim.Type.Split('/').Last();
            return claimType.Equals("IsAdministrator", StringComparison.OrdinalIgnoreCase) &&
                bool.TryParse(claim.Value, out var isAdmin) &&
                isAdmin;
        }
    }
}
