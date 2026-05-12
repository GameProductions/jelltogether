using System;
using System.Collections.Generic;
using System.Security.Claims;
using MediaBrowser.Common.Api;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
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

    [ApiController]
    [Route("jelltogether")]
    [Authorize]
    public class JellTogetherController : ControllerBase
    {
        private RoomManager _roomManager => Plugin.Instance?.RoomManager ?? throw new System.Exception("Plugin not initialized");
        private string CurrentUserId => User.Identity?.Name ?? "Unknown";

        [HttpGet]
        [AllowAnonymous]
        public IActionResult Open()
        {
            return Redirect(CompanionUrl());
        }

        [HttpGet("Companion")]
        [AllowAnonymous]
        public IActionResult OpenCompanion()
        {
            return Redirect(CompanionUrl());
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

            if (!IsValidPublicUrl(publicJellyfinUrl)) return BadRequest("Public Jellyfin URL must be a valid http(s) URL.");
            if (!IsValidPublicUrl(publicCompanionUrl)) return BadRequest("Public companion URL must be a valid http(s) URL.");

            var plugin = Plugin.Instance;
            if (plugin == null) return StatusCode(500, "Plugin not initialized.");

            var config = plugin.Configuration;
            config.PublicJellyfinUrl = publicJellyfinUrl;
            config.PublicCompanionUrl = publicCompanionUrl;
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
        public ActionResult<JellTogetherRoom> GetRoomByCode(string code)
        {
            var room = _roomManager.GetRoomByCode(code);
            if (room == null) return NotFound();
            return Ok(RoomForUser(room));
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

        [HttpPost("Rooms/{roomId}/Join")]
        public ActionResult JoinRoom(string roomId, [FromQuery] string? code = null)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!_roomManager.JoinRoom(roomId, CurrentUserId, code)) return Forbid();
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Queue")]
        public ActionResult AddToQueue(string roomId, [FromBody] string title)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            if (string.IsNullOrWhiteSpace(title)) return BadRequest("Queue title is required.");
            _roomManager.AddToQueue(roomId, title, CurrentUserId);
            return Ok();
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
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!CanManage(room)) return Forbid();
            _roomManager.AddTrivia(roomId, question);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Invitations")]
        public ActionResult<JellTogetherInvite> CreateInvite(string roomId, [FromBody] CreateInviteRequest request)
        {
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

        [HttpPost("Rooms/{roomId}/Leave")]
        public ActionResult LeaveRoom(string roomId)
        {
            _roomManager.LeaveRoom(roomId, CurrentUserId);
            return Ok();
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
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!CanManage(room)) return Forbid();

            _roomManager.CreatePoll(roomId, request.Question, request.Options);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Polls/{pollId}/Vote")]
        public ActionResult Vote(string roomId, string pollId, [FromBody] string option)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (!room.Participants.Contains(CurrentUserId)) return Forbid();
            _roomManager.Vote(roomId, pollId, CurrentUserId, option);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Webhook")]
        public ActionResult SetWebhook(string roomId, [FromBody] string url)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            if (room.OwnerId != CurrentUserId) return Forbid();

            if (!_roomManager.SetWebhook(roomId, url)) return BadRequest("Only Discord webhook URLs are allowed.");
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Theme")]
        public ActionResult SetTheme(string roomId, [FromBody] string theme)
        {
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
        public ActionResult AddMessage(string roomId, [FromBody] string text)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (!room.Participants.Contains(CurrentUserId)) return Forbid();

            var message = new ChatMessage
            {
                UserId = CurrentUserId,
                UserName = CurrentUserId,
                Text = text
            };

            if (!_roomManager.AddMessage(roomId, message)) return Forbid();
            return Ok();
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
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            if (room.OwnerId != CurrentUserId) return Forbid();

            _roomManager.SetDiscordStage(roomId, request.BotToken, request.StageId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/SyncStage")]
        public async Task<ActionResult> SyncStage(string roomId, [FromBody] string title)
        {
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

        private string CompanionUrl(string? code = null)
        {
            var configuredCompanion = NormalizeBaseUrl(Plugin.Instance?.Configuration.PublicCompanionUrl);
            if (!string.IsNullOrEmpty(configuredCompanion))
            {
                return string.IsNullOrWhiteSpace(code)
                    ? configuredCompanion
                    : $"{configuredCompanion}/Invite/{Uri.EscapeDataString(code.Trim())}";
            }

            var basePath = Request.PathBase.HasValue ? Request.PathBase.Value : string.Empty;
            var query = string.IsNullOrWhiteSpace(code) ? string.Empty : $"?code={Uri.EscapeDataString(code.Trim())}";
            return $"{basePath}/web/{query}#/configurationpage?name=jelltogether";
        }

        private static string NormalizeBaseUrl(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? string.Empty : value.Trim().TrimEnd('/');
        }

        private static bool IsValidPublicUrl(string value)
        {
            if (string.IsNullOrEmpty(value)) return true;
            return Uri.TryCreate(value, UriKind.Absolute, out var uri) &&
                (uri.Scheme == Uri.UriSchemeHttps || uri.Scheme == Uri.UriSchemeHttp);
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
