# JellTogether User Guide

Welcome to JellTogether. This guide is the fastest way to understand where things live and how the room is put together.

## What JellTogether Does
JellTogether is an interactive Jellyfin watch party plugin. It lets a room host:

- start synced playback from Jellyfin
- chat in real time
- assign seats
- queue media
- run polls and theory notes
- sync a Discord Stage topic
- manage who can talk, control playback, or moderate the room

## The Main Areas
The companion is split into two parts:

- the main room view in the center
- the control sidebar on the right

The main room view is where you see:

- the theater screen
- the seats
- the theory board
- the queue

The sidebar is where you manage:

- chat
- room settings
- participants
- polls

## Getting Started
1. Open JellTogether from Jellyfin or use the public companion URL set by the server owner.
2. Create a party.
3. Share the invite code, QR code, or invite link with other people.
4. Have participants join and take seats.
5. Add media to the queue or start playback from a Jellyfin session.

## Lobby
The lobby shows active rooms. From here you can:

- create a new room
- join a room from the list
- join by invite code
- open the changelog
- copy the companion link

## Inside a Room
When you are inside a room, the top of the page shows:

- the room name
- participant count
- the theater screen
- the current now-playing title

The theater screen opens host playback controls when you click it.

## Theater Screen
The theater screen is the big center panel in the room.

Use it to:

- view the current synced playback
- open theater controls
- resync playback if the room gets out of step
- sync from an already playing Jellyfin session

If the room has an active stream, the screen can also show a live preview of the media.

## Seats
The seating chart shows who is assigned to each seat.

- Click an open seat to take it.
- Click an occupied seat to view the person sitting there.
- If a person has a profile image, it appears on the seat.
- If no profile image is available, initials are used instead.

## Chat
Use the chat panel in the sidebar to talk with the room.

- Type a message and press Enter or use the send button.
- Use reactions to reply emotionally without typing.
- Direct replies and @mentions help keep conversations readable.
- Discord Stage messages can also mirror into chat when configured.

## Room Controls
The Room tab is for host and moderation tasks.

Common controls include:

- invite rules
- queue voting
- Discord Stage sync
- playback resync
- delete room
- room management layout mode

## People Tab
The People tab shows everyone in the room.

It also shows:

- host and co-host badges
- moderation controls
- invite permissions
- playback readiness indicators
- pending joins
- banned participants

If a user has a ready playback target, they are marked Ready.

## Queue
The Up Next queue is where you manage the order of playback.

You can:

- add media to the queue
- select specific episodes, seasons, movies, or collection items
- move items up or down
- vote on queue items when voting is enabled
- clear the queue if you have permission

## Playback Targets
Playback targets are the Jellyfin sessions the room can control.

The targets list helps you see:

- which sessions are active
- which ones can be controlled remotely
- which ones are ready to start playback
- which ones are already managed by the room

If a target is not ready, the checklist explains why.

## Discord Stage
If the room is connected to a Discord Stage, JellTogether can sync the room title to the Stage topic and mirror Stage chat into the room.

Important notes:

- the Stage channel must already exist
- the Discord bot must have permission to view and manage the Stage channel
- start the Stage in Discord before syncing it from JellTogether

## Mobile Tips
On smaller screens:

- the page can scroll vertically
- the sidebar may be docked, scrollable, or floating depending on room mode
- the playback targets list and modal windows can scroll independently

## Need a Shortcut?
Look for these places first:

- Lobby: join or create a party
- Theater screen: playback controls
- Chat tab: messaging
- Room tab: host actions
- People tab: participant controls
- Polls tab: live polls

## Troubleshooting
- If you do not see a playback target, open Jellyfin on the target device, sign into the same account, and make sure remote control is allowed.
- If Discord Stage sync says the Stage is not live, start the Stage inside Discord first.
- If the room does not update quickly, refresh the room or use the resync buttons.
- If the queue or playback buttons are missing, check your room permissions.
