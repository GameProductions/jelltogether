using System.Collections.Generic;
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

    [ApiController]
    [Route("jelltogether")]
    [Authorize]
    public class JellTogetherController : ControllerBase
    {
        private RoomManager _roomManager => Plugin.Instance?.RoomManager ?? throw new System.Exception("Plugin not initialized");
        private string CurrentUserId => User.Identity?.Name ?? "Unknown";

        [HttpGet("CurrentUser")]
        public ActionResult<object> GetCurrentUser()
        {
            return Ok(new { id = CurrentUserId, name = CurrentUserId });
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
    }
}
