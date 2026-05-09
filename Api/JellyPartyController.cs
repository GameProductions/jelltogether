using System.Collections.Generic;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using JellyParty.Plugin.Services;

namespace JellyParty.Plugin.Api
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
    [Route("JellyParty")]
    [Authorize]
    public class JellyPartyController : ControllerBase
    {
        private RoomManager _roomManager => Plugin.Instance?.RoomManager ?? throw new System.Exception("Plugin not initialized");

        [HttpPost("Rooms")]
        public ActionResult<JellyPartyRoom> CreateRoom([FromBody] string name)
        {
            var userId = User.Identity?.Name ?? "Unknown";
            var room = _roomManager.CreateRoom(name, userId);
            return Ok(room);
        }

        [HttpGet("Rooms")]
        public ActionResult<IEnumerable<JellyPartyRoom>> GetRooms()
        {
            var rooms = _roomManager.GetAllRooms().Where(r => !r.IsPrivate).ToList();
            foreach (var room in rooms) MaskSensitive(room);
            return Ok(rooms);
        }

        [HttpGet("Rooms/ByCode/{code}")]
        public ActionResult<JellyPartyRoom> GetRoomByCode(string code)
        {
            // Check main room code
            var room = _roomManager.GetAllRooms().FirstOrDefault(r => r.RoomCode.Equals(code, System.StringComparison.OrdinalIgnoreCase));
            if (room != null) return Ok(room);

            // Check advanced invites
            room = _roomManager.GetAllRooms().FirstOrDefault(r => r.Invitations.Any(i => 
                i.Code.Equals(code, System.StringComparison.OrdinalIgnoreCase) && 
                (i.ExpiresAt == null || i.ExpiresAt > System.DateTime.UtcNow) &&
                (i.MaxUses == 0 || i.CurrentUses < i.MaxUses)
            ));

            if (room == null) return NotFound();
            MaskSensitive(room);
            return Ok(room);
        }

        [HttpPost("Rooms/{roomId}/TogglePrivacy")]
        public ActionResult TogglePrivacy(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var callerId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != callerId) return Forbid();

            _roomManager.TogglePrivacy(roomId);
            return Ok();
        }

        [HttpGet("Rooms/{roomId}")]
        public ActionResult<JellyPartyRoom> GetRoom(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            MaskSensitive(room);
            return Ok(room);
        }

        [HttpPost("Rooms/{roomId}/Join")]
        public ActionResult JoinRoom(string roomId, [FromQuery] string? code = null)
        {
            var userId = User.Identity?.Name ?? "Unknown";
            var room = _roomManager.GetRoom(roomId);
            if (room != null && !room.Participants.Contains(userId))
            {
                // Assign a seat
                int seat = 0;
                while (room.CinemaSeats.Values.Contains(seat)) seat++;
                room.CinemaSeats[userId] = seat;
            }
            _roomManager.JoinRoom(roomId, userId, code);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Queue")]
        public ActionResult AddToQueue(string roomId, [FromBody] string title)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";
            room.Queue.Add(new QueueItem { Title = title, AddedBy = userId });
            room.LastUpdated = System.DateTime.UtcNow;
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Theories")]
        public ActionResult AddTheory(string roomId, [FromBody] string text)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";
            room.Theories.Add(new TheoryNote { Text = text, Author = userId });
            room.LastUpdated = System.DateTime.UtcNow;
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Reactions")]
        public ActionResult SendReaction(string roomId, [FromBody] string emoji)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";

            room.RecentReactions.Add(emoji);
            room.Stats.TotalReactions++;
            room.Stats.TopReactor = userId; // Simplified
            room.LastUpdated = System.DateTime.UtcNow;
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Trivia")]
        public ActionResult StartTrivia(string roomId, [FromBody] TriviaQuestion question)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            room.Trivia.Add(question);
            room.LastUpdated = System.DateTime.UtcNow;
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Invitations")]
        public ActionResult<JellyPartyInvite> CreateInvite(string roomId, [FromBody] CreateInviteRequest request)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var userId = User.Identity?.Name ?? "Unknown";
            var isAdmin = room.OwnerId == userId || room.CoHostIds.Contains(userId);
            
            if (!isAdmin && !room.AllowParticipantInvites) return Forbid();

            var perms = new ParticipantPermissions { CanChat = request.CanChat, CanControlPlayback = request.CanControl };
            var invite = _roomManager.CreateInvite(roomId, userId, perms, request.HoursValid, request.MaxUses);
            return Ok(invite);
        }

        [HttpPost("Rooms/{roomId}/ToggleParticipantInvites")]
        public ActionResult ToggleParticipantInvites(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != userId) return Forbid();

            _roomManager.ToggleParticipantInvites(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Leave")]
        public ActionResult LeaveRoom(string roomId)
        {
            var userId = User.Identity?.Name ?? "Unknown";
            _roomManager.LeaveRoom(roomId, userId);
            return Ok();
        }

        [HttpGet("Rooms/{roomId}/Updates")]
        public ActionResult<JellyPartyRoom> GetRoomUpdates(string roomId, [FromQuery] DateTime since)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            
            if (room.LastUpdated <= since)
            {
                return StatusCode(304);
            }

            MaskSensitive(room);
            return Ok(room);
        }

        [HttpPost("Rooms/{roomId}/Participants/{userId}/Permissions")]
        public ActionResult SetPermissions(string roomId, string userId, [FromBody] ParticipantPermissions permissions)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
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

            var callerId = User.Identity?.Name ?? "Unknown";
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

            var callerId = User.Identity?.Name ?? "Unknown";
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

            var callerId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != callerId && !room.CoHostIds.Contains(callerId)) return Forbid();

            _roomManager.CreatePoll(roomId, request.Question, request.Options);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Polls/{pollId}/Vote")]
        public ActionResult Vote(string roomId, string pollId, [FromBody] string option)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
            _roomManager.Vote(roomId, pollId, callerId, option);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Webhook")]
        public ActionResult SetWebhook(string roomId, [FromBody] string url)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != callerId) return Forbid();

            _roomManager.SetWebhook(roomId, url);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Theme")]
        public ActionResult SetTheme(string roomId, [FromBody] string theme)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != callerId && !room.CoHostIds.Contains(callerId)) return Forbid();

            _roomManager.SetTheme(roomId, theme);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Buffering")]
        public ActionResult SetBuffering(string roomId, [FromBody] bool isBuffering)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
            _roomManager.SetBuffering(roomId, callerId, isBuffering);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/ToggleControl")]
        public ActionResult ToggleControl(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var callerId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != callerId) return Forbid();

            _roomManager.ToggleHostControl(roomId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/Messages")]
        public ActionResult AddMessage(string roomId, [FromBody] string text)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();

            var message = new ChatMessage
            {
                UserId = User.Identity?.Name ?? "Unknown",
                UserName = User.Identity?.Name ?? "Unknown",
                Text = text
            };

            _roomManager.AddMessage(roomId, message);
            return Ok();
        }
        [HttpGet("Rooms/{roomId}/Recap")]
        public ActionResult<RoomStats> GetRecap(string roomId)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            return Ok(room.Stats);
        }

        [HttpPost("Rooms/{roomId}/DiscordStage")]
        public ActionResult SetDiscordStage(string roomId, [FromBody] DiscordStageRequest request)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != userId) return Forbid();

            _roomManager.SetDiscordStage(roomId, request.BotToken, request.StageId);
            return Ok();
        }

        [HttpPost("Rooms/{roomId}/SyncStage")]
        public async Task<ActionResult> SyncStage(string roomId, [FromBody] string title)
        {
            var room = _roomManager.GetRoom(roomId);
            if (room == null) return NotFound();
            var userId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != userId && !room.CoHostIds.Contains(userId)) return Forbid();

            await _roomManager.UpdateDiscordStage(roomId, title);
            return Ok();
        }

        private void MaskSensitive(JellyPartyRoom room)
        {
            var userId = User.Identity?.Name ?? "Unknown";
            if (room.OwnerId != userId)
            {
                room.DiscordBotToken = null;
            }
        }
    }
}
