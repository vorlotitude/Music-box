# Game Music Box

> **Game Event → Reaction → Music / SFX**

Game Music Box is a Windows background companion app. It watches your game
using legal, publicly documented, non-invasive state interfaces, then
automatically triggers music, sound effects or voice lines you have bound to
in-game events.

The core idea:

```
GAME → EVENT → EMOTION → REACTION → MUSIC
```

You are not playing the music — **the game is scoring your screen.**

---

## Highlights

- **Phase-1 game: CS2** via official **Game State Integration (GSI)**, an
  opt-in HTTP/JSON hook the game exposes. No memory reading, no injection, no
  client modification, no anti-cheat bypass.
- **Cross-game adapter architecture.** `CS2Adapter` translates CS2 state into a
  **Universal Game Event** model. Adding VALORANT / PUBG / Apex / LoL later
  only means adding a new adapter — the music, rule and audio systems never
  change. A second concrete adapter, `LolAdapter` (real LCU transport: lockfile
  discovery + localhost poll in `electron/game/LcuClient`, wired into the main
  process and GameController on a dedicated channel), already plays audio from a
  League GAME_END in a full app-layer test (§3).
- **Music Boxes & Rules.** `WHEN Event + IF conditions THEN play Audio`, with
  priority, cooldown, ducking, volume, random/sequential playback.
- **User-imported local music.** MP3 / WAV / FLAC / OGG / M4A. The app stores
  *file references + metadata only* — it never copies or re-distributes your
  files, and never bundles third-party copyrighted music. Duration is probed
  from each file's own headers (WAV/FLAC exact, MP3 VBR/CBR, OGG last-page
  granule, M4A `moov/mvhd`).
- **Dark, premium, audio-centric UI.** Spotify-style library IA +
  SFX/DAW density + gaming HUD vibes.
- **Local-first & private.** Configuration, rules and game state stay on your
  machine. No telemetry, no upload by default.

---

## Quick Start (development)

Requirements: **Node.js 18/20/22**, npm.

```bash
npm install          # installs deps (downloads Electron binary on first run)
npm run dev:app      # compile + launch the app (loads the built renderer)
```

If you want React hot-reload in a browser during UI work:

```bash
npm run dev          # concurrently runs Vite (http://localhost:5173) + tsc watch
```

> The app reads `dist/renderer` for its UI. After UI changes run
> `npm run build:renderer` (or `npm run dev:app`) to refresh the view.

### Full production build

```bash
npm run build        # typecheck + renderer + electron + NSIS installer
npm run build:dir    # same but unpacked folder (no installer)
```

Output lands in `release/` (`release/win-unpacked/Game Music Box.exe` for the
unpacked build, `release/*.exe` for the NSIS installer). On a machine without a
code-signing cert, disable certificate auto-discovery to produce an unsigned
build:

```bash
export CSC_IDENTITY_AUTO_DISCOVERY=false   # PowerShell: $env:CSC_IDENTITY_AUTO_DISCOVERY="false"
npm run build
```

---

## Verify & test

```bash
npm test             # unit + integration tests (engines, CS2 adapter, closed loop)
npm run test:watch
npm run typecheck    # strict TS check of renderer + core + electron
```

Status: **220 tests passing** — unit tests (event / rule / audio engines, CS2
adapter incl. GAME_START/END, MATCH_POINT, edge-triggered LOW_HP, MULTIKILL /
KILLSTREAK streak detection, GRENADE_THROW / FLASH_THROW / SMOKE_THROW throw
detection from weapon ammo-reserve drops, and CLUTCH from the opt-in
`allplayers_state` optic, audio router incl. sequential
crossfade and true random selection for `PLAY_RANDOM`, and the cross-game
`LolAdapter` — LCU lockfile discovery + localhost HTTPS poll (`electron/game/
LcuClient`, transport + mapper both unit-tested) mapping the flat game-stats
shape onto GAME_START / GAME_END with win-loss + KDA) plus closed-loop
integration tests that prove the real
pipeline end-to-end with a fake audio backend, application-layer tests
(GameController, incl. sequential handoff, cooldown reset at match boundaries,
notice emission for audio-unavailable / game-disconnect, and playback-history /
recently-played stats for PLAY_AUDIO / PLAY_RANDOM / PLAY_SEQUENTIAL), Music Box
import/export tests, folder-scan IPC tests, notice-host UI tests and UI tests
(§26 hardens: the audio engine also swallows a missing/unavailable *output
device* and resumes playback once it returns — no crash, no active track); UI tests
for Home, Library, Music Boxes, Rules (visual rule builder), Audio, Settings
and Games pages:

```text
CS2 GSI payload → CS2Adapter → EventEngine → RuleEngine → AudioEngine → playback
```

Covered scenarios: binding an asset to a win, silence when unbound, priority
conflict resolution, cooldown blocking (and reset at GAME_START/GAME_END
match boundaries), `winStreak >= 3` conditions, ducking
while the mic is active, rule audio-routing (`SELF_ONLY` / `TEAMMATES` /
`BOTH`) flowing into delivery sinks (speaker vs voice-chat virtual mic), and
`PLAY_SEQUENTIAL` advancing track-by-track on natural end while halting on
interrupt.

### Run the app (smoke test)

```bash
npm run build:renderer && npm run build:electron
npm start            # launches the Electron app
```

The app boots to the Home dashboard, puts an icon in the system tray, and opens
a loopback GSI listener on `127.0.0.1:3001` (configurable). Sending a real CS2
GSI payload to that port is accepted (`HTTP 200`) and logged as "first contact"
without any crash, which verifies the 
`CS2 → GSI → adapter → engine → audio` pipeline is live before a match starts.

---

## Enabling CS2 GSI

Game State Integration is opt-in. Create/edit:

```
Steam/userdata/<your-id>/730/local/cfg/gamestate_integration_gamemusicbox.cfg
```

with:

```
"GameMusicBox"
{
  "uri"      "http://127.0.0.1:3001"
  "timeout"  "5.0"
  "buffer"   "0.1"
  "throttle" "0.5"
  "heartbeat" "10.0"
  "data"
  {
    "provider"            "1"
    "map"                 "1"
    "round"               "1"
    "player_state"        "1"
    "player_weapons"      "1"
  }
}
```

Restart CS2. Game Music Box listens on **127.0.0.1:3001** and will show
**CS2 · Connected** once the game sends its heartbeat, along with live
`ROUND_WIN` / `ROUND_LOSS` / `PLAYER_KILL` / etc. events.

> Non-invasive by design: GSI only lets the game *push* state to us. We never
> read memory or touch the game process.

---

## Manual event testing (Developer Mode)

In the app, open **Rules → Developer Mode** and fire test events
(`TEST ROUND WIN`, `TEST KILL`, …) to exercise the whole pipeline
`Event → Rule → Audio` without launching CS2, while watching a live event /
rule / audio log.

## Errors never crash the app

Every layer degrades gracefully and the UI surfaces the state (§26): a matched
rule whose audio file is missing shows an **"Audio unavailable"** toast, a lost
game connection shows a **"Game disconnected"** toast, and unbound events are
simply ignored. Audio load/device failures log and end cleanly instead of
throwing. You can tap the toast to dismiss it.

## Persistent runtime log

All runtime activity — GSI first-contact, game process changes, Engine events,
rule matches, and audio decisions — is written to a dated file under the app
user-data directory (`userData/logs/gmb-<YYYY-MM-DD>.log`) in addition to the
in-app Event Log. Rendering logs are forwarded over IPC and never crash the app
if the disk is unavailable. This gives you a traceable record for debugging
matches (Developer Mode / Event logging) outside the UI (§2 / §16).

---

## Architecture (layered)

```
React UI
   ▲  typed IPC bridge (window.gmb)
Application Layer (GameController)
   ▲
Game Adapter Layer (CS2Adapter)  ──► EventEngine ──► RuleEngine ──► AudioEngine
   │                                                                   ▲
Electron Main (GSI server, process monitor, JsonStore, tray)     AudioBackend (Howler/HTML5)
```
- `core/` — game-agnostic engines & adapters (pure TypeScript, unit-tested).
- `electron/` — main process: GSI listener, CS2 process monitor, JSON store,
  tray, and the `appmedia://` scheme for local audio playback.
- `src/` — React renderer (pages, state, theme).

Details in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

---

## Legal & compatibility

- CS2 support uses only the official **Game State Integration** interface.
- Each game adapter ships a `LEGAL / COMPATIBILITY` note; anything that could
  touch anti-cheat or EULA is **not implemented** and recorded as a known
  limitation instead. See [`docs/LEGAL.md`](docs/LEGAL.md).
- **First-party content model = user-imported local music.** The app does not
  host, crawl, download or distribute any third-party copyrighted audio.

---

## License

MIT — see `LICENSE`. Game Music Box itself is an entertainment/accessibility
utility; it is not affiliated with Valve, Riot Games, etc. All trademarks
belong to their respective owners.