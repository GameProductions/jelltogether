using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
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
        public int HoursValid { get; set; } = 24;
        public int MaxUses { get; set; } = 0;
    }

    public class DiscordStageRequest
    {
        public string BotToken { get; set; } = string.Empty;
        public string StageId { get; set; } = string.Empty;
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
        public bool PersistRoomHistory { get; set; } = true;
        public int DefaultInviteExpirationHours { get; set; } = 24;
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
    }

    public class StartWatchPartyResult
    {
        public string Title { get; set; } = string.Empty;
        public int StartedCount { get; set; }
        public int EligibleCount { get; set; }
        public List<string> FailedSessionIds { get; set; } = new();
    }

    [ApiController]
    [Route("jelltogether")]
    [Authorize]
    public class JellTogetherController : ControllerBase
    {
        private readonly ISessionManager _sessionManager;
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
            return Ok(new { id = CurrentUserId, name = CurrentUserId });
        }

        [HttpGet("Settings")]
        public ActionResult<object> GetSettings()
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
                persistRoomHistory = config?.PersistRoomHistory ?? true,
                defaultInviteExpirationHours = config?.DefaultInviteExpirationHours ?? 24,
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
                persistRoomHistory = config?.PersistRoomHistory ?? true,
                defaultInviteExpirationHours = config?.DefaultInviteExpirationHours ?? 24
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
            config.PersistRoomHistory = request.PersistRoomHistory;
            config.DefaultInviteExpirationHours = Math.Clamp(request.DefaultInviteExpirationHours, 0, 24 * 30);
            plugin.SaveConfiguration(config);
            return Ok();
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
            if (!_roomManager.JoinRoom(roomId, CurrentUserId, code)) return Forbid();
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Queue")]
        public ActionResult AddToQueue(string roomId, [FromBody] JsonElement payload)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            if (!CanManage(room) && Plugin.Instance?.Configuration.AllowParticipantQueueAdds == false) return Forbid();

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
            _roomManager.AddToQueue(roomId, title, CurrentUserId, request.MediaId, request.LibraryId, request.MediaType, request.Overview);
            return Ok();
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
            if (!CanManage(room)) return Forbid();

            var item = room.Queue.FirstOrDefault(queueItem => queueItem.Id == itemId);
            if (item == null) return NotFound();
            if (!Guid.TryParse(item.MediaId, out var mediaId)) return BadRequest("Queue item is not linked to a playable Jellyfin item.");

            var targets = PlaybackTargetsForRoom(room)
                .Where(target => target.IsActive && target.SupportsRemoteControl && target.SupportsMediaControl)
                .ToList();

            var requestedSessionIds = request?.TargetSessionIds?.Where(id => !string.IsNullOrWhiteSpace(id)).ToHashSet(StringComparer.OrdinalIgnoreCase) ?? new();
            if (requestedSessionIds.Count > 0)
            {
                targets = targets.Where(target => requestedSessionIds.Contains(target.SessionId)).ToList();
            }

            if (targets.Count == 0) return BadRequest("No active controllable Jellyfin sessions are available for this room.");

            var controllingSessionId = ControllerSessionId();
            var controllingUserId = ControllerUserGuid();
            var playRequest = new PlayRequest
            {
                ItemIds = new[] { mediaId },
                PlayCommand = PlayCommand.PlayNow,
                ControllingUserId = controllingUserId
            };

            var failed = new List<string>();
            foreach (var target in targets)
            {
                try
                {
                    await _sessionManager.SendPlayCommand(controllingSessionId, target.SessionId, playRequest, cancellationToken).ConfigureAwait(false);
                }
                catch
                {
                    failed.Add(target.SessionId);
                }
            }

            if (failed.Count < targets.Count)
            {
                _roomManager.MarkNowPlaying(roomId, item);
            }

            return Ok(new StartWatchPartyResult
            {
                Title = item.Title,
                EligibleCount = targets.Count,
                StartedCount = targets.Count - failed.Count,
                FailedSessionIds = failed
            });
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

            var perms = new ParticipantPermissions { CanChat = request.CanChat, CanControlPlayback = request.CanControl };
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
            // Only Owner or Co-Host can change permissions
            if (room.OwnerId != callerId && !room.CoHostIds.Contains(callerId))
            {
                return Forbid();
            }

            _roomManager.SetUserPermissions(roomId, userId, permissions.CanChat, permissions.CanControlPlayback);
            return Ok();
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

        [HttpPost("Rooms/{roomId}/DiscordStage")]
        public ActionResult SetDiscordStage(string roomId, [FromBody] DiscordStageRequest request)
        {
            if (request == null) return BadRequest("Discord stage payload is required.");
            if (string.IsNullOrWhiteSpace(request.BotToken)) return BadRequest("Discord bot token is required.");
            if (string.IsNullOrWhiteSpace(request.StageId)) return BadRequest("Discord stage id is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (room.OwnerId != CurrentUserId) return Forbid();

            _roomManager.SetDiscordStage(roomId, request.BotToken, request.StageId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/SyncStage")]
        public async Task<ActionResult> SyncStage(string roomId, [FromBody] string title)
        {
            if (string.IsNullOrWhiteSpace(title)) return BadRequest("Discord stage title is required.");

            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();

            await _roomManager.UpdateDiscordStage(roomId, title);
            return Ok();
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

        private JellTogetherRoom RoomForUser(JellTogetherRoom room)
        {
            room.DiscordBotToken = null;

            if (room.OwnerId != CurrentUserId && !room.CoHostIds.Contains(CurrentUserId))
            {
                room.DiscordWebhookUrl = null;
                room.Invitations = new List<JellTogetherInvite>();
            }

            return room;
        }

        private List<PlaybackTargetDto> PlaybackTargetsForRoom(JellTogetherRoom room)
        {
            return _sessionManager.Sessions
                .Where(session => SessionBelongsToRoomParticipant(session, room))
                .Select(session => new PlaybackTargetDto
                {
                    SessionId = session.Id,
                    UserId = session.UserId.ToString("D"),
                    UserName = session.UserName,
                    Client = session.Client,
                    DeviceName = session.DeviceName,
                    IsActive = session.IsActive,
                    SupportsRemoteControl = session.SupportsRemoteControl,
                    SupportsMediaControl = session.SupportsMediaControl,
                    IsCurrentUser = SessionMatchesCurrentUser(session)
                })
                .OrderByDescending(target => target.IsCurrentUser)
                .ThenBy(target => target.UserName)
                .ThenBy(target => target.DeviceName)
                .ToList();
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

        private IActionResult StandaloneCompanion(string? code = null)
        {
            var assembly = Assembly.GetExecutingAssembly();
            using var stream = assembly.GetManifestResourceStream("JellTogether.Web.jelltogether.html");
            if (stream == null) return NotFound("JellTogether companion page was not found.");

            using var reader = new StreamReader(stream);
            var fragment = reader.ReadToEnd();
            var basePath = Request.PathBase.HasValue ? Request.PathBase.Value : string.Empty;
            var resourceBase = $"{basePath}/web/configurationpage?name=";
            fragment = fragment.Replace("configurationpage?name=", resourceBase, StringComparison.Ordinal);

            var queryScript = string.IsNullOrWhiteSpace(code)
                ? string.Empty
                : $"<script>window.JELL_TOGETHER_INVITE_CODE = {System.Text.Json.JsonSerializer.Serialize(code.Trim())};</script>";

            var html = $@"<!DOCTYPE html>
<html lang=""en"">
<head>
    <meta charset=""UTF-8"">
    <meta name=""viewport"" content=""width=device-width, initial-scale=1.0"">
    <title>JellTogether | Jellyfin Watch Party Companion</title>
</head>
<body class=""jelltogether-standalone"">
{queryScript}
{fragment}
</body>
</html>";

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
