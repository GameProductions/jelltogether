import os
import json
import hashlib
import zipfile
import subprocess
import shlex
from datetime import datetime, timezone

# --- CONFIGURATION ---
GITHUB_USER = "GameProductions"
REPO_NAME = "jelltogether"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(BASE_DIR, "version.txt"), "r") as f:
    VERSION = f.read().strip()
TARGET_ABI = "10.11.8.0"
GUID = "f9e1e2d3-a4b5-4c6d-8e9f-0a1b2c3d4e5f"
# ---------------------

PUBLISH_DIR = os.path.join(BASE_DIR, "bin", "Release", "net9.0", "publish")
ZIP_NAME = f"jelltogether_{VERSION}.zip"
ZIP_PATH = os.path.join(BASE_DIR, ZIP_NAME)
REPO_JSON_PATH = os.path.join(BASE_DIR, "repository.json")
MANIFEST_JSON_PATH = os.path.join(BASE_DIR, "manifest.json")
CHANGELOG = """Full-stack security and stability hardening.

- Moved standalone companion Jellyfin access tokens from persistent local storage into server-scoped session storage and removed broad localStorage token discovery.
- Replaced dynamic HTML injection with safe DOM construction in companion status, diagnostics, and troubleshooting UI.
- Changed immersive headset support to a safe theater-mode fallback until a full WebXR render layer is available.
- Added atomic room persistence with backup recovery so corrupted room storage no longer clears all rooms.
- Added server-side Jellyfin media and library validation before queueing or starting playback.
- Tightened participant-created invites so only room participants can create them and non-host invites cannot grant playback control.
- Scoped Discord Stage chat sync to the active synced party room and added bounded Discord HTTP timeouts.
- Added standalone companion security headers and stricter forwarded-proto handling.
- Removed shell execution from the release helper.
- Bumped the package version so Jellyfin refreshes the repository entry, release asset URL, and checksum."""

HISTORICAL_RELEASES = [
    {
        "version": "1.4.3.0",
        "changelog": """Republish Discord Stage settings and playback diagnostics as a fresh Jellyfin patch release.

- Moved Discord Stage bot configuration out of individual watch party rooms and into the administrator-only global settings page.
- Added server-wide Discord Stage channel ID and bot token settings with saved-token status and a clear-token option.
- Kept room-level Discord Stage sync as a host/co-host action that uses the global server configuration.
- Added collapsible Discord bot setup requirements, Stage channel discovery, manual channel ID fallback, and a Discord connection test.
- Added JELLTOGETHER_DISCORD_BOT_TOKEN support for server/container-provided bot tokens that override UI-saved tokens.
- Fixed detected Stage channel display so server and channel names render reliably from Discord API responses.
- Fixed Discord connection tests and topic sync to use Discord Stage Instance endpoints for live Stage topics.
- Made the Discord Stage connection test non-mutating so it no longer fails when the bot can read a Stage channel but cannot edit the live Stage topic.
- Added optional Discord Stage chat sync between the active Stage channel chat and active JellTogether party rooms.
- Improved Jellyfin playback session matching and controller fallbacks for standalone companion sessions.
- Added WebXR-aware immersive mode handling with secure-context detection, XR session cleanup, and headset-friendly fallback layout.
- Added playback start diagnostics to trace Jellyfin target eligibility and command failures.
- Bumped the package version so Jellyfin refreshes the repository entry, release asset URL, and checksum.""",
        "timestamp": "2026-06-05T22:58:35Z",
        "checksum": "23CEA06BBD45D6323A4F6B7D2D936E21"
    },
    {
        "version": "1.3.0.0",
        "changelog": """Establish compile-time single source of truth versioning, upgrade server indicators, and support playback modal back navigation.

- Consolidated system-wide version attributes into a single root-level version.txt file parsed dynamically during MSBuild compilation and release packaging.
- Refactored the header server details card into an ultra-compact status button with real-time glowing connectivity indicators to resolve URL spacing issues.
- Relocated long server connection host URLs into a gorgeous, dedicated Server Status details overlay modal.
- Integrated full-stack back button navigation support inside diagnostic Playback Target details modals, resolving UI routing loops.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.3.0.0/jelltogether_1.3.0.0.zip",
        "checksum": "FCB5E191D10CFF714777F68706226F37",
        "timestamp": "2026-05-18T01:59:01Z",
    },
    {
        "version": "1.2.18.0",
        "changelog": """Add target device connection diagnostics, status checklists, and interactive troubleshooting guides.

- Added an info button next to each playback target device in the dashboard summary and session initializer.
- Added a non-intrusive hover tooltip checklist showing awake state, remote command support, and player engine bindings.
- Added a gorgeous clickable glassmorphic diagnostic modal showing technical session fields.
- Added custom-tailored step-by-step resolution advice for failed connection criteria.
- Kept ineligible target devices visible in selection views with a clean, low-opacity disabled style to allow real-time diagnostic troubleshooting.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.18.0/jelltogether_1.2.18.0.zip",
        "checksum": "B7CCCB4568E6616E1D1AF0E971A66230",
        "timestamp": "2026-05-18T01:58:00Z",
    },
    {
        "version": "1.2.17.0",
        "changelog": """A maintenance patch release to structure release archives on disk and update build dependencies.

- Relocated older ZIP release packages into the /archives folder to optimize root-level directory layout.
- Configured git to ignore binary archives to prevent repository bloating.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.17.0/jelltogether_1.2.17.0.zip",
        "checksum": "71A255A8139388EB74C907A1077986D8",
        "timestamp": "2026-05-18T00:09:44Z",
    },
    {
        "version": "1.2.16.0",
        "changelog": """Fix HTTP mixed content issues on secure HTTPS Jellyfin sites behind reverse proxies.

- Respect the X-Forwarded-Proto header on the backend to correctly identify HTTPS scheme behind SSL-terminating reverse proxies.
- Dynamically upgrade matching http:// host URLs to https:// in frontend normalizeBaseUrl when page protocol is HTTPS.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.16.0/jelltogether_1.2.16.0.zip",
        "checksum": "A7F27B7C027CE56E152B0DBE6F929699",
        "timestamp": "2026-05-17T23:38:00Z",
    },
    {
        "version": "1.2.15.0",
        "changelog": """Add theater screen controls, connected-server switching, profile-aware seating details, and full Jellyfin revision history.

- Turn the theater screen into a host/co-host control surface for queued playback, media search, and playback targets.
- Show the connected Jellyfin server in the companion header with a manual server update option.
- Fix profile images and layout in seat and participant detail views.
- Remove the inline What's New card while keeping the changelog modal available.
- Publish the full JellTogether release history in Jellyfin repository metadata.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.15.0/jelltogether_1.2.15.0.zip",
        "checksum": "393CF8FF2D183BF7F90A68FEA02012B0",
        "timestamp": "2026-05-17T21:12:23Z",
    },
    {
        "version": "1.2.14.0",
        "changelog": """Fix standalone companion Jellyfin server detection and API routing.

- Added explicit Jellyfin server URL bootstrap for standalone companion pages.
- Added a Jellyfin server URL field to standalone sign-in when the companion cannot infer the server.
- Routed companion API calls, poster art, and profile images through the detected Jellyfin server URL.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.14.0/jelltogether_1.2.14.0.zip",
        "checksum": "AA8E8431B35B049B6936AB988196C98E",
        "timestamp": "2026-05-17T15:11:08Z",
    },
    {
        "version": "1.2.13.0",
        "changelog": """Add companion changelog, version badges, and group queue select-all controls.

- Added a companion-visible changelog synced from the project changelog.
- Added version badges to the companion header, room listings, and changelog entries.
- Added Select All and Deselect All controls to group queue picking.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.13.0/jelltogether_1.2.13.0.zip",
        "checksum": "4FD90C89CB5E01C08435A134729B60C6",
        "timestamp": "2026-05-17T10:53:29Z",
    },
    {
        "version": "1.2.12.0",
        "changelog": """Add sign-out, paginated queue controls, clear queue, selectable group queueing, and media detail previews.

- Added a companion sign-out/sign-in action.
- Added paginated Up Next queue controls after 10 items.
- Added host and co-host queue clearing.
- Added media detail previews for search results and queued Jellyfin items.
- Added selectable collection, season, and episode queue additions.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.12.0/jelltogether_1.2.12.0.zip",
        "checksum": "438234E07B206B9D871CA641F6762817",
        "timestamp": "2026-05-15T21:41:12Z",
    },
    {
        "version": "1.2.11.0",
        "changelog": """Add companion-side Jellyfin sign-in.

- Added Jellyfin account sign-in from the standalone companion.
- Reused the local companion token for public companion access.
- Resumed pending invite-code joins after successful companion sign-in.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.11.0/jelltogether_1.2.11.0.zip",
        "checksum": "7B186D59AF8329367D9B4EF9A086C5A3",
        "timestamp": "2026-05-15T16:01:10Z",
    },
    {
        "version": "1.2.10.0",
        "changelog": """Fix playback, queue, and settings permission handling.

- Made playback-control permissions apply to Start Watch Party.
- Kept queue reordering scoped to hosts and co-hosts so API permissions match the UI.
- Added queue-add permissions to generated invite rules.
- Added standalone companion sign-in guidance when Jellyfin authentication is missing.
- Added current-user fallbacks for standalone media search and library loading.
- Added clipboard failure handling to the global settings companion URL pill.
- Made queue-add denials return errors instead of appearing successful.
- Added the companion token fallback to global settings and removed stale room guidance.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.10.0/jelltogether_1.2.10.0.zip",
        "checksum": "9FFAC0ACF2D83A8E78A0E61AAED339BC",
        "timestamp": "2026-05-15T15:49:53Z",
    },
    {
        "version": "1.2.7.0",
        "changelog": """Add room moderation controls, join approval, join locking, bans, and delegated participant management.

- Added join approval, join locking, pending join requests, kick, ban, unban, and reject controls.
- Added per-participant permissions for chat, playback control, queue adds, and delegated participant management.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.7.0/jelltogether_1.2.7.0.zip",
        "checksum": "D21B3BAF3B0368EF0152183A8647D1AA",
        "timestamp": "2026-05-13T17:34:23Z",
    },
    {
        "version": "1.2.6.0",
        "changelog": """Add host-controlled Start Watch Party playback for queued Jellyfin media.

- Added host/co-host Start controls for queued Jellyfin media.
- Added playback target selection for active remote-controllable Jellyfin sessions in the room.
- Stored now-playing room state after successfully sending playback commands.
- Added now-playing details to lobby room listings.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.6.0/jelltogether_1.2.6.0.zip",
        "checksum": "54133818527014C52B737FE3166EE6E5",
        "timestamp": "2026-05-13T17:20:27Z",
    },
    {
        "version": "1.2.5.0",
        "changelog": """Add interactive theater seats, profile avatars, chat replies, mentions, and message reactions.

- Assigned participants visibly to theater seats with initials, hover details, and click-through participant details.
- Show Jellyfin profile pictures on occupied seats when available, with initials as fallback.
- Added seat switching by clicking an open theater seat.
- Added chat replies, @mentions, and emoji reactions on individual messages.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.5.0/jelltogether_1.2.5.0.zip",
        "checksum": "6840F871ABEB9146E62E4A58C2490E1D",
        "timestamp": "2026-05-13T17:07:32Z",
    },
    {
        "version": "1.2.4.0",
        "changelog": """Show actual Jellyfin media folders in global settings and add season, series, and collection queue options.

- Changed global library access settings to load actual Jellyfin media folders before falling back to user views.
- Added queue options to add an entire season, series, or matching collection when selecting Jellyfin media.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.4.0/jelltogether_1.2.4.0.zip",
        "checksum": "3336EC39845F88D115ABD45966DA1633",
        "timestamp": "2026-05-13T16:58:23Z",
    },
    {
        "version": "1.2.3.0",
        "changelog": """Point the Jellyfin sidebar entry to global settings.

- Changed the Jellyfin sidebar entry to open the global settings page.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.3.0/jelltogether_1.2.3.0.zip",
        "checksum": "3D117C0CAA367D65AA44DCDF096A8DC3",
        "timestamp": "2026-05-13T16:52:01Z",
    },
    {
        "version": "1.2.2.0",
        "changelog": """Fix Jellyfin plugin listing settings navigation and refresh the Jellyfin listing banner.

- Fixed Jellyfin plugin listing settings navigation so it can only open global settings.
- Refreshed the Jellyfin listing banner with a taller 16:9 watch-party design.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.2.0/jelltogether_1.2.2.0.zip",
        "checksum": "A53D98B4F13436448B731F02DD591249",
        "timestamp": "2026-05-13T16:47:13Z",
    },
    {
        "version": "1.2.1.0",
        "changelog": """Fix Jellyfin plugin listing settings navigation so it opens global settings instead of the companion.

- Corrected the plugin listing Settings button target.
- Ensured global settings open independently from the companion experience.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.1.0/jelltogether_1.2.1.0.zip",
        "checksum": "8EAC522698B376E8DE885D76B30507D7",
        "timestamp": "2026-05-13T13:36:10Z",
    },
    {
        "version": "1.2.0.0",
        "changelog": """Add global settings, library-scoped media search queueing, queue voting, and host queue reordering.

- Added a global settings page for public access URLs, library access, and system-wide JellTogether defaults.
- Replaced manual queue title entry with Jellyfin library search scoped to selected libraries.
- Added host queue voting controls and host queue reordering.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.2.0.0/jelltogether_1.2.0.0.zip",
        "checksum": "2620F03143D338918CAB1068E604EDE9",
        "timestamp": "2026-05-13T12:09:51Z",
    },
    {
        "version": "1.1.11.0",
        "changelog": """Polish People tab controls and clearly label public access, companion link, and invite code fields.

- Improved People tab participant action buttons so room state controls have enough space and clearer visual states.
- Added explicit labels for the public Jellyfin URL, generated companion URL, and invite code sections.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.11.0/jelltogether_1.1.11.0.zip",
        "checksum": "82121528FACAFB9682AC57B2EE6BAF90",
        "timestamp": "2026-05-13T11:34:20Z",
    },
    {
        "version": "1.1.10.0",
        "changelog": """Refine room controls with inline room renaming, tabbed sidebar sections, and simpler delete confirmation.

- Replaced the rename button with inline host-editable room names.
- Reworked the room sidebar into focused Chat, Room, People, and Polls tabs.
- Simplified room deletion confirmation so hosts no longer have to type DELETE.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.10.0/jelltogether_1.1.10.0.zip",
        "checksum": "ED3820E3FDBE74F5DF649B7E90720A69",
        "timestamp": "2026-05-13T06:21:42Z",
    },
    {
        "version": "1.1.9.0",
        "changelog": """Add room management controls, copyable companion links, and normalized nested room data for chat, queue, and theory board entries.

- Added room rename/delete controls, removable queue and theory entries, and copyable companion URL pills.
- Normalized nested room payload data so chat, queue, and theory board entries render names and content correctly.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.9.0/jelltogether_1.1.9.0.zip",
        "checksum": "F9F917B4173363EA63552B8424A8A365",
        "timestamp": "2026-05-13T05:32:30Z",
    },
    {
        "version": "1.1.8.0",
        "changelog": """Normalize Jellyfin API room payload casing so room joins and newly-created parties resolve correctly.

- Normalized room identifiers from server responses.
- Prevented newly-created rooms and room cards from trying to join an undefined room id.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.8.0/jelltogether_1.1.8.0.zip",
        "checksum": "2DBDC5194AC70CDB63DEDB1AA515C82E",
        "timestamp": "2026-05-13T04:46:50Z",
    },
    {
        "version": "1.1.6.0",
        "changelog": """Send Jellyfin web access tokens with companion API requests to prevent unauthorized plugin calls.

- Added Jellyfin web authentication tokens to companion API requests.
- Prevented Settings, CurrentUser, and Rooms calls from failing with 401 when opened inside Jellyfin.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.6.0/jelltogether_1.1.6.0.zip",
        "checksum": "CF3E7FCAF61EDAD40199437FF436609E",
        "timestamp": "2026-05-13T02:36:35Z",
    },
    {
        "version": "1.1.5.0",
        "changelog": """Fix Jellyfin configuration-page markup so the JellTogether companion opens in the web UI.

- Adjusted embedded page markup for Jellyfin's configuration page loader.
- Fixed the companion page shell so it can render from Jellyfin plugin navigation.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.5.0/jelltogether_1.1.5.0.zip",
        "checksum": "23ECD6A3714598C06C1FFC66C0E94F9D",
        "timestamp": "2026-05-13T02:30:41Z",
    },
    {
        "version": "1.1.4.0",
        "changelog": """Stop bundling Jellyfin server assemblies so plugin pages register against the host contracts.

- Removed bundled Jellyfin server assemblies from the plugin package.
- Let the installed Jellyfin server provide the host contracts used by plugin pages.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.4.0/jelltogether_1.1.4.0.zip",
        "checksum": "C972D5EE0B99C335C6C87B7C59DD873B",
        "timestamp": "2026-05-13T02:25:45Z",
    },
    {
        "version": "1.1.3.0",
        "changelog": """Fix Jellyfin menu page resource registration so the companion opens from plugin menus.

- Fixed Jellyfin menu page resource registration.
- Made the companion accessible from plugin menus after installation.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.3.0/jelltogether_1.1.3.0.zip",
        "checksum": "4515CEBD8B3720BE33B194FF1AE5BCAA",
        "timestamp": "2026-05-13T02:12:55Z",
    },
    {
        "version": "1.1.2.0",
        "changelog": """Fix public companion redirects, invite links, QR access, and Discord Stage sync handling.

- Improved public companion redirect handling.
- Fixed invite links and QR access paths.
- Hardened Discord Stage sync behavior.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.2.0/jelltogether_1.1.2.0.zip",
        "checksum": "60E4C131738602F0387FBB7CCDC624B2",
        "timestamp": "2026-05-13T02:02:56Z",
    },
    {
        "version": "1.1.1.0",
        "changelog": """Expose the JellTogether page in Jellyfin navigation and fix embedded web asset loading.

- Added the JellTogether page to Jellyfin navigation.
- Fixed embedded companion asset loading from Jellyfin.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.1.0/jelltogether_1.1.1.0.zip",
        "checksum": "E421BC261B4917BA8A474A91E7ABA94A",
        "timestamp": "2026-05-12T18:48:12Z",
    },
    {
        "version": "1.1.0.0",
        "changelog": """Rename to JellTogether, harden watch party room security, refresh branding, and add Jellyfin-friendly assets.

- Renamed the plugin and visible app branding to JellTogether.
- Replaced the visual identity with watch-party themed logo and banner assets.
- Added Jellyfin-friendly asset variants for listings.
- Hardened watch party room security and invitation behavior.""",
        "targetAbi": TARGET_ABI,
        "sourceUrl": "https://github.com/GameProductions/jelltogether/releases/download/v1.1.0.0/jelltogether_1.1.0.0.zip",
        "checksum": "B6EEF5826105FF15C15144981B3263FC",
        "timestamp": "2026-05-12T17:17:18Z",
    },
]

def compact_release_history(versions):
    """Keep one Jellyfin-visible release entry per calendar day."""
    grouped = {}
    order = []

    for version in versions:
        day = version.get("timestamp", "")[:10] or version.get("version", "")
        if day not in grouped:
            grouped[day] = []
            order.append(day)
        grouped[day].append(version)

    compacted = []
    for day in order:
        releases = sorted(grouped[day], key=lambda item: item.get("timestamp", ""), reverse=True)
        latest = dict(releases[0])
        if len(releases) == 1:
            compacted.append(latest)
            continue

        heading = ""
        bullets = []
        for release in releases:
            changelog = release.get("changelog", "").strip()
            if not changelog:
                continue
            lines = [line.rstrip() for line in changelog.splitlines()]
            if not heading:
                heading = next((line for line in lines if line.strip()), "")
            for line in lines:
                stripped = line.strip()
                if stripped.startswith("- "):
                    if stripped not in bullets:
                        bullets.append(stripped)

        latest["changelog"] = heading
        if bullets:
            latest["changelog"] += "\n\n" + "\n".join(bullets)
        compacted.append(latest)

    return compacted

def run_command(cmd):
    print(f"Running: {cmd}")
    subprocess.run(shlex.split(cmd), check=True)

def calculate_md5(file_path):
    md5_hash = hashlib.md5()
    with open(file_path, "rb") as f:
        for byte_block in iter(lambda: f.read(4096), b""):
            md5_hash.update(byte_block)
    return md5_hash.hexdigest().upper()

def create_zip(source_dir, output_path):
    print(f"Creating ZIP: {output_path}")
    with zipfile.ZipFile(output_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for root, dirs, files in os.walk(source_dir):
            for file in files:
                if file.endswith(".dll") or file in {"manifest.json", "logo.png", "banner.png"}:
                    file_path = os.path.join(root, file)
                    arcname = os.path.relpath(file_path, source_dir)
                    zipf.write(file_path, arcname)

def plugin_manifest_entry(checksum, timestamp, image_key, image_value, include_history=True):
    source_url = f"https://github.com/{GITHUB_USER}/{REPO_NAME}/releases/download/v{VERSION}/{ZIP_NAME}"
    versions = [
        {
            "version": f"{VERSION}",
            "changelog": CHANGELOG,
            "targetAbi": TARGET_ABI,
            "sourceUrl": source_url,
            "checksum": checksum,
            "timestamp": timestamp
        }
    ]

    if include_history:
        versions.extend(HISTORICAL_RELEASES)
        versions = compact_release_history(versions)

    return {
        "guid": GUID,
        "name": "JellTogether",
        image_key: image_value,
        "description": "The ultimate social watch party plugin for Jellyfin.",
        "overview": "Host high-fidelity watch parties with virtual cinema seats, theory boards, and synchronized playback.",
        "owner": GITHUB_USER,
        "category": "Social",
        "versions": versions
    }

def write_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")

def generate_metadata_json(checksum):
    print("Generating manifest metadata...")
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    image_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO_NAME}/main/banner.png"

    repo_data = [
        plugin_manifest_entry(checksum, timestamp, "imageUrl", image_url)
    ]

    manifest_data = [
        {
            **plugin_manifest_entry(checksum, timestamp, "imagePath", "logo.png"),
            "imageUrl": image_url
        }
    ]

    write_json(REPO_JSON_PATH, repo_data)
    write_json(MANIFEST_JSON_PATH, manifest_data)
    print(f"Success! {REPO_JSON_PATH} and {MANIFEST_JSON_PATH} created.")

def write_package_manifest(path):
    print("Writing package manifest...")
    image_url = f"https://raw.githubusercontent.com/{GITHUB_USER}/{REPO_NAME}/main/banner.png"
    package_data = [
        {
            **plugin_manifest_entry("", "", "imagePath", "logo.png", include_history=False),
            "imageUrl": image_url
        }
    ]
    write_json(path, package_data)

def main():
    try:
        os.chdir(BASE_DIR)
        # 1. Build the project
        run_command("dotnet publish -c Release")
        
        # 2. Write package metadata. The repository metadata below carries the
        # real archive checksum; the package manifest avoids a stale self-checksum.
        dest_manifest = os.path.join(PUBLISH_DIR, "manifest.json")
        write_package_manifest(dest_manifest)
        
        # 3. Create the ZIP
        create_zip(PUBLISH_DIR, ZIP_PATH)
        
        # 4. Calculate Checksum
        checksum = calculate_md5(ZIP_PATH)
        print(f"MD5: {checksum}")
        
        # 5. Generate repository metadata
        generate_metadata_json(checksum)
        
        print("\n--- NEXT STEPS ---")
        print(f"1. Create or update a GitHub Release named 'v{VERSION}'.")
        print(f"2. Upload '{ZIP_NAME}' to the release assets.")
        print("3. Add your raw 'repository.json' URL to Jellyfin > Dashboard > Plugins > Repositories.")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    main()
