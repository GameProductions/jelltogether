# JellTogether Changelog

## [2026-05-15] - Global settings card polish
- Changed system default options into card-style controls.
- Added thumbnail previews to library access cards when Jellyfin has a library image.

## [2026-05-13] - Room moderation controls
- Added join approval, join locking, pending join requests, kick, ban, unban, and reject controls.
- Added per-participant permissions for chat, playback control, queue adds, and delegated participant management.

## [2026-05-13] - Start watch party playback
- Added host/co-host Start controls for queued Jellyfin media.
- Added playback target selection for active remote-controllable Jellyfin sessions in the room.
- Stored now-playing room state after successfully sending playback commands.
- Added now-playing details to lobby room listings.

## [2026-05-13] - Interactive theater seats
- Assigned participants visibly to theater seats with initials, hover details, and click-through participant details.
- Show Jellyfin profile pictures on occupied seats when available, with initials as fallback.
- Added seat switching by clicking an open theater seat.
- Added chat replies, @mentions, and emoji reactions on individual messages.

## [2026-05-13] - Library access media folders
- Changed global library access settings to load actual Jellyfin media folders before falling back to user views.
- Added queue options to add an entire season, series, or matching collection when selecting Jellyfin media.

## [2026-05-13] - Sidebar settings routing
- Changed the Jellyfin sidebar entry to open the global settings page.

## [2026-05-13] - Listing settings route and banner refresh
- Fixed Jellyfin plugin listing settings navigation so it can only open global settings.
- Refreshed the Jellyfin listing banner with a taller 16:9 watch-party design.

## [2026-05-13] - Plugin settings navigation fix
- Fixed Jellyfin plugin listing settings navigation so it opens global settings instead of the companion page.

## [2026-05-13] - Global settings and library queue search
- Added a global settings page for public access URLs, library access, and system-wide JellTogether defaults.
- Replaced manual queue title entry with Jellyfin library search scoped to selected libraries.
- Added host queue voting controls and host queue reordering.

## [2026-05-13] - People tab and access label polish
- Improved People tab participant action buttons so room state controls have enough space and clearer visual states.
- Added explicit labels for the public Jellyfin URL, generated companion URL, and invite code sections.

## [2026-05-13] - Inline room editing and tabbed controls
- Replaced the rename button with inline host-editable room names.
- Reworked the room sidebar into focused Chat, Room, People, and Polls tabs.
- Simplified room deletion confirmation so hosts no longer have to type DELETE.

## [2026-05-13] - Room management and companion link polish
- Added room rename/delete controls, removable queue and theory entries, and copyable companion URL pills.
- Normalized nested room payload data so chat, queue, and theory board entries render names and content correctly.

## [2026-02-07] - Initial project structure and boilerplate
- Documentation updated.

## [2026-02-15] - Implemented core RoomManager and configuration persistence
- Documentation updated.

## [2026-02-22] - Added REST API endpoints for room discovery and creation
- Documentation updated.

## [2026-03-01] - Implemented basic Web UI with lobby and room views
- Documentation updated.

## [2026-03-09] - Developed real-time synchronization logic and player integration
- Documentation updated.

## [2026-03-17] - Enhanced security with RBAC and invitation permission system
- Documentation updated.

## [2026-03-25] - Implemented social features: real-time chat and emoji reactions
- Documentation updated.

## [2026-04-03] - Added Immersive VR Mode with WebXR support and 'Starry Void' theme
- Documentation updated.

## [2026-04-12] - Developed Theater Themes (Cyberpunk, Horror) and ambient sync
- Documentation updated.

## [2026-04-20] - Implemented Advanced Engagement: Live Polls and Theory Boards
- Documentation updated.

## [2026-04-29] - Added Collaborative Queueing and End-of-Party Recap Engine
- Documentation updated.

## [2026-05-08] - Phase 12: Discord Stage Orchestrator and Performance Hardening
- Documentation updated.
