![JellTogether banner](banner.png)

# JellTogether

Interactive Jellyfin watch party plugin for synced viewing.

A high-performance watch party plugin focusing on synchrony and social interaction.

## Compatibility
- Jellyfin target ABI: `10.11.8.0`
- .NET target: `net9.0`
- Current plugin version: `1.3.2.0`

## Installation
Add the JellTogether plugin repository in Jellyfin:

```text
https://raw.githubusercontent.com/GameProductions/jelltogether/refs/heads/main/repository.json
```

Then install **JellTogether** from Jellyfin Dashboard > Plugins > Catalog. If Jellyfin has cached an older repository response, refresh the plugin catalog or restart Jellyfin before retrying.

## Access
- Jellyfin menu: open **JellTogether** from the regular main menu or from the server dashboard plugin area.
- Direct companion URL: `/jelltogether/Companion`
- Jellyfin invite URL format: `/jelltogether/Invite/YOURCODE`
- Optional public companion URL format: `https://your-domain.example/jelltogether/Companion?code=YOURCODE`

Server owners can set their own public Jellyfin URL and public companion URL inside the JellTogether companion.

## Global Settings
Administrators can configure JellTogether from the Jellyfin plugin settings page.

Important settings:
- Public Jellyfin URL: external base URL used when generating companion links.
- Generated companion URL: public companion entrypoint based on the public Jellyfin URL.
- Library access: limits which Jellyfin libraries can be searched from room queues.
- System defaults: queue voting, participant queue adds, participant invite creation, Android TV playback targeting, room persistence, and invite expiration.
- Discord Stage: bot token, Stage channel selection, setup guidance, and connection testing.

## Discord Stage Setup
JellTogether can sync the current watch party title to a Discord Stage channel topic. This feature requires a Discord bot that you create and invite to the Discord server containing the Stage channel.

Requirements:
- Create your own Discord application and bot in the Discord Developer Portal.
- Invite the bot to the Discord server that owns the Stage channel.
- Grant the bot permission to view channels and manage the selected Stage channel.
- Use a Discord Stage channel ID, not a text or voice channel ID.

Token storage options:
- Easy setup: paste the bot token into JellTogether global settings. The token is hidden in the UI, but it is stored in Jellyfin plugin configuration.
- More secure setup: set `JELLTOGETHER_DISCORD_BOT_TOKEN` on the Jellyfin server or container and restart Jellyfin. When this environment variable is present, JellTogether uses it instead of any UI-saved token and disables token editing in settings.

After the bot token is available, use global settings to test the Discord connection and select or enter the Stage channel ID.

## Playback Requirements
JellTogether starts playback through Jellyfin remote control. For a device to appear as a usable playback target:

- The participant must have an active Jellyfin client session.
- The client must allow remote control.
- The client usually needs media controls available. If a device appears but cannot be controlled, start any media briefly in that client, pause it, then refresh targets.
- Android TV clients can be allowed through the global Android TV playback targeting option when they expose remote control.
- The room owner, co-host, or a participant with playback-control permission must start playback.

When playback fails or only starts on some devices, JellTogether shows a playback diagnostics modal with target eligibility and command-attempt details. Full diagnostic identifiers are shown only to room owners and co-hosts.

## Room Features
- Public and private watch party rooms.
- Invite links, invite codes, optional invite expiration, and generated QR codes.
- Join approval, join locking, kick, ban, unban, and delegated participant management.
- Per-participant permissions for chat, playback control, queue adds, and participant management.
- Host/co-host theater controls for queued Jellyfin media.
- Queue voting, queue reordering, queue clearing, and selectable season/series/collection queue additions.
- Chat replies, mentions, message reactions, floating reactions, polls, theory board notes, and recap stats.
- Seat assignment and Jellyfin profile image display when available.

## Features
- Persistent room management
- Thread-safe session handling
- Social chat and floating reactions
- Immersive VR Mode (WebXR)
- Live Polls and Theory Boards
- Collaborative media queueing
- Discord Stage integration

## Troubleshooting
- **Plugin install returns 500:** confirm the version listed in `repository.json` has a matching GitHub release asset and checksum.
- **No playback targets:** open Jellyfin on the target device, sign in as the room participant, enable remote control in the client, and refresh playback targets.
- **Target says media control unavailable:** start playback manually in the target Jellyfin client for a few seconds, pause it, then try again.
- **Discord Stage picker is empty:** confirm the bot token is valid, the bot is invited to the correct server, and the bot can view the Stage channel.
- **Discord test fails to manage topic:** grant the bot role permission to manage the selected Stage channel.

## Development
Build locally:

```bash
dotnet build
```

Create release metadata and package:

```bash
python3 generate_repo.py
```

The release package should be uploaded to a GitHub release named `vX.Y.Z.0` with asset name `jelltogether_X.Y.Z.0.zip`, matching the generated `repository.json` entry.
