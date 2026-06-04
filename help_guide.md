# JellTogether User Guide

Welcome to JellTogether!

## Getting Started
1. Open JellTogether from the Jellyfin menu, browse directly to `/jelltogether/Companion` on your Jellyfin server, or use the public companion URL configured by the server owner.
2. Click + Create Party.
3. Share the generated invite link, or give friends the invite code.

## Public Access
- Administrators can set a public Jellyfin URL and public companion URL in the companion sidebar.
- Save your public Jellyfin base URL, such as `https://jellyfin.example.com`, to generate public companion links automatically.
- If you run a dedicated companion route, save the full companion page URL, such as `https://jellyfin.example.com/jelltogether/Companion`, as the public companion URL.

## Host Controls
- Lock controls to prevent skipping.
- Toggle privacy for hidden rooms.

## Social Interaction
- Send emojis that burst across the screen!
- Chat in real-time with your friends.

## VR Mode
- Use any WebXR-compatible headset for a 3D cinema experience.

## Engagement
- Use the Theory Board to pin notes during mysteries.
- Start live polls to let everyone vote.

## Discord Stage
- Sync your movie title to a Discord Stage topic automatically.
- You must create your own Discord bot and invite it to the server containing the Stage channel.
- The bot needs permission to view channels and manage the selected Stage channel.
- Administrators can paste the bot token in JellTogether global settings for easy setup.
- For stronger token storage, set `JELLTOGETHER_DISCORD_BOT_TOKEN` on the Jellyfin server or container, restart Jellyfin, then leave the Bot Token field blank.
- When `JELLTOGETHER_DISCORD_BOT_TOKEN` is present, JellTogether uses that server-provided token and disables token editing in the settings UI.
- Use Test Discord Connection in global settings to validate the bot token, Stage channel type, and manage-channel permission.

## Admin Notes
- The Discord environment token always takes precedence over a token saved through the settings UI.
- Playback start diagnostics are shown when Jellyfin rejects a remote playback command or when no eligible target is available.
- Full playback diagnostic identifiers are limited to room owners and co-hosts; other playback-enabled participants receive redacted status details.
- If a plugin install fails, confirm the release ZIP exists at the `repository.json` `sourceUrl` and that the MD5 checksum matches.
