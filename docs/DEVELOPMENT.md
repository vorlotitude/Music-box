# Game Music Box — Developer Guide

How the app is built, how the pieces connect, and how to extend it for the
next game. Read `README.md` first for product context.

---

## 1. Layout

```
electron/        Main process (Node side)
  main/index.ts          window + tray + app lifecycle + appmedia:// scheme
  ipc.ts                 typed IPC handlers for the renderer bridge
  gsi/GsiServer.ts       GSI HTTP/JSON listener (default 127.0.0.1:3001)
  game/processMonitor.ts throttled cs2.exe process detection
  media/meta.ts          duration probe (WAV/FLAC exact, MP3 via CBR or XING)
  store/JsonStore.ts     JSON-file store (id-keyed documents per collection)
  preload/index.ts       contextBridge → window.gmb
core/            Game-agnostic engines (pure TS, unit tested)
  events/GameEvent.ts    Universal Game Event + SessionSnapshot types
  adapters/GameAdapter.ts      adapter interface (cross-game contract)
  adapters/legalNotes.ts       per-game §20 LEGAL / COMPATIBILITY NOTES (shared)
  adapters/cs2/CS2Adapter.ts   CS2 GSI → Universal events + test triggers
  engine/EventEngine.ts  session bookkeeping (streaks, kills, low HP, …)
  engine/RuleEngine.ts   WHEN/IF/THEN matching + priority + cooldown
  rules/Rule.ts          Rule / Condition / Action types
  library/AudioAsset.ts  audio asset model (optionally carries a TrackLicense)
  pack/TrackLicense.ts   §19 Music Pack license model + validity/territory gating
  audio/AudioEngine.ts   priority / queue / crossfade / ducking / buses
  audio/AudioBackend.ts  interface for the actual playback backend
src/             React renderer
  bridge.ts              typed window.gmb bridge (mock in plain browser)
  domain/GameController.ts   app orchestrator wiring the whole pipeline
  state/                 Zustand store + AppProvider boot
  pages/                 Home / Library / MusicBoxes / Games / Rules / Settings
  components/            BottomPlayer, shared UI primitives
  audio/HowlerBackend.ts HTML5/Howler playback backend
  theme.ts               design tokens (dark, premium, audio-centric)
```

---

## 2. Event flow (one screenshot)

```
CS2 Game State Integration ──HTTP 3001──► electron/main GsiServer
                                             │ webContents.send("gmb:raw-payload")
                                             ▼
                         renderer domain/GameController
                                             │ bridge.onRawPayload
                                             ▼
        CS2Adapter.handlePayload(payload)  ──►  UniversalGameEvent[]
                                             │  EventEngine.dispatch(each)
                                             ▼
                                     session snapshot enriched
                                             │  RuleEngine.evaluate(e)
                                             │   ├─ cooldown? → skip
                                             │   └─ match → AudioEngine.play(action)
                                             ▼
                                   HowlerBackend  →  speakers/headphones
```

Because adapters emit only **UniversalGameEvent**, `EventEngine / RuleEngine /
AudioEngine` never look at CS2 fields. Adding a game is purely additive.

A **second concrete adapter — `LolAdapter`** (`core/src/adapters/lol/LolAdapter.ts`)
already validates this cross-game contract **end to end**: the transport
(`electron/game/LcuClient.ts` — Lockfile discovery across the Riot Client /
legacy League install dirs, `parseLockfile`, and a localhost HTTPS poll
re-reading the session token each tick) lives in the platform layer exactly as
the CS2 GSI listener does, and the main process relays its assembled
`LcuSnapshot` ticks to the renderer on a dedicated `gmb:lcu-payload` channel.
The adapter maps `gameflow-phase` (`InProgress` → `GAME_START`, session reset) and
the **flat** `lol-end-of-game/v1/game-stats` shape (`teams[]` + `localPlayer.gameId`,
KDA + WIN/LOSE per player) onto `GAME_END` (once per `gameId`, re-armed at the next
`GAME_START`). GameController mounts both adapters; a League win with a bound rule
plays audio — proven by unit, transport, closed-loop and app-layer tests.

---

## 3. Adding a game adapter (e.g. VALORANT)

1. Create `core/src/adapters/valorant/ValorantAdapter.ts` implementing
   `GameAdapter`:

   ```ts
   interface GameAdapter {
     readonly game: GameId;                    // "cs2" | "valorant" | ...
     onEvent(cb: (e: UniversalGameEvent) => void): () => void;
     handlePayload(payload: unknown): UniversalGameEvent[];
     triggerTestEvent(type: GameEventType): void;
   }
   ```

2. Translate platform state into the existing `GAME_EVENT_TYPES`. If a new
   concept is truly missing, add it to `GameEvent.ts` only after modeling how
   other games map to it (keep the union minimal and cross-game).
3. Wire the new source into `electron/main` (for VALORANT this is typically a
   local REST/event source, not memory).
4. Add a `LEGAL / COMPATIBILITY NOTES` block (see `docs/LEGAL.md`).

No changes to `RuleEngine`, `AudioEngine`, or the UI rule builder are needed.

---

## 4. Rule & session model

- `Rule = event + conditions[] + action + priority + cooldownMs`.
- Event engine maintains a `SessionSnapshot` so conditions can reference
  win/loss streaks, kill counts, health, round number, MVP/clutch flags.
- **Priority lane recommendation:** decisive/match events ~100, MVP/clutch ~80,
  kill/death ~50, utility ~30, minor ~10. Higher priority interrupts lower
  (crossfade) via the AudioEngine.

---

## 5. Audio engine

- **Buses:** master / music / sfx / voice; each track carries a `baseVolume`.
- **Ducking:** on ambient-voice signal detection the tracked cut by
  `duckFactor` (0.2 by default / -14 dB); restore on silence.
- **Queueing:** a new higher-or-equal-priority request crossfades out the
  current track and starts; lower priority is ignored while a higher one plays.
- **Backend seam:** `AudioBackend` abstracts playback so a future
  Virtual-Microphone mixer can be added without touching the engine.

---

## 6. Local store

`JsonStore` is a simple id-keyed JSON document store. Collections: `assets`,
`rules`, `boxes`, `settings`. It intentionally avoids `better-sqlite3` (needs a
C++ toolchain); a migration to SQLite is easy later by swapping the one
`store/*` implementation behind the same IPC surface.

---

## 7. Testing

```bash
npm test
```

- `core/src/**/*.test.ts` covers: CS2 payload → events, LoL `LolAdapter` mapping
  (`gameflow-phase` InProgress → GAME_START, flat `teams[]` game-stats →
  GAME_END with win/loss + KDA, once-per-`gameId` edge guard, session reset
  across matches, streak/win–loss bookkeeping, dev-mode test triggers), event
  engine session bookkeeping, rule matching/priority/cooldown, and audio
  priority/fade/duck.
- **League LCU transport** `electron/game/LcuClient.test.ts` covers lockfile
  parsing (`name:pid:port:password:protocol`, colon-name, malformed/oversized
  rejection), reading a real lockfile from disk, poller edge cases (disappearing
  lockfile → no-op), and client lifecycle running-edge reporting. No real LCU is
  required — the mapper layer is driven with the same flat shapes.
- **Closed-loop integration tests** live in `core/src/integration/closedLoop.test.ts`.
  They wire all four layers — `CS2Adapter → EventEngine → RuleEngine →
  AudioEngine` — with a fake audio backend and assert the real end-to-end
  behavior: asset binding on a win, silence when unbound, priority-conflict
  resolution, cooldown blocking, `winStreak >= 3` conditions, a GSI 1vX
  `CLUTCH` payload firing its bound asset, mic-ducking, and the LoL pipeline
  (`LolAdapter` flat game-stats win → `GAME_END` → bound audio) through the same
  engine/rule/audio stack.
- **Application-layer test** `src/domain/GameController.test.ts` drives the
  *real* `GameController` (the same instance the UI boots) with an injected
  fake store bridge + fake audio backend. It proves the full user workflow —
  import music (seed store) → create rule (seed store) → GSI event via the
  same `onRawPayload` seam the main process uses → Event → Rule → AudioEngine
  → play — plus dev-mode `testEvent()`, silence-when-unbound, graceful
  handling of a missing audio file, and the **LoL path** (`onLcuPayload` +
  `onLcuRunning` seams): a bound-rule League win plays its asset and the
  client running-edge flips the connection indicator.
- Dev-mode test events (`TEST ROUND WIN/LOSS … BOMB PLANT`) are covered at the
  adapter level (every Home label normalizes to its matching event) and at the
  app layer (a `BOMB PLANT` trigger fires a `BOMB_PLANTED` rule).
- **CS2 event completeness** is covered at the adapter: GAME_START/END (map
  phase transitions), MATCH_POINT (score == roundsToWin-1), edge-triggered
  LOW_HP (fires once per threshold crossing), and MULTIKILL / KILLSTREAK from
  consecutive-kill streaks (window expiry + death both break the streak).
- Cooldown lifecycle is covered at the app layer: a rule fires → a repeat
  fire within its window is blocked → a GAME_END (match boundary) resets the
  cooldown so the rule can fire again in the next match.
- **Playback history** is covered at the app layer: each play bumps
  `playCount` / `lastPlayedAt` and surfaces via Library recently-played /
  most-played sorting.
- **Ducking mic threshold** is covered at the audio-engine layer (configurable
  mic level + duck factor, restoring on silence).
- **Persistent runtime log** (`gmb:log:append` + `appendLogLine`) is covered in
  `electron/ipc.log.test.ts` (ISO formatting + dated-file write).
- **GSI HTTP listener** — the real entry point where CS2 posts its state — is
  covered in `electron/gsi/GsiServer.test.ts`: it boots a real loopback server
  and drives it over HTTP, proving valid pushes reach the payload callback,
  malformed JSON / non-POST / oversized bodies never crash or wedge the server,
  and first contact is reported exactly once. Fixes landed here: `stop()`
  actually clears the running handle so `isRunning` flips to false, and
  `onFirstContact` only fires on the first successful push (so main's "first
  contact from CS2" log line no longer repeats on every GSI tick).
- **Game-process detection** — which drives the Home Connected/Disconnected
  panel (§2 "游戏启动/退出检测") — is covered in `electron/game/processMonitor.test.ts`.
  The OS probe is injected so tests never shell out to PowerShell; they assert
  edge-triggered onChange (fires on start and on exit, never while steady),
  that only configured process names are reported, that probe errors surface
  via onError without crashing, and that stop() halts polling.
- **Developer Mode** event test triggers are normalized by the CS2 adapter
  (`normalizeTestType`) and covered there (§29). HEADSHOT_KILL and PLAYER_ASSIST
  now resolve correctly instead of collapsing into a plain kill / the default.
  The Home Dev Bar exposes a TEST button for every bindable event type (round,
  kill/death/headshot/assist, MVP, clutch, grenade/flash/smoke, bomb plant/
  defuse, match point); the renderer test verifies each button forwards the
  exact canonical event type to the controller.
  Note: **CLUTCH is now auto-detected** from the opt-in `allplayers_state` optic
  (when the watched player is the only survivor on their team in a live round,
  edge-triggered once per round and re-armed at the next round's freezetime).
  Only **MVP** still has no direct GSI signal, so it remains bindable and
  verifiable via Dev Mode test triggers but is not auto-detected yet — recorded
  as a data-level limitation rather than implemented via an intrusive path.
- **AI Music Box Generator** (§22, configuration layer): `core/src/ai/promptToMusicBox.ts`
  maps plain-language requests (e.g. "输五把以后给我放最搞笑的音乐") onto suggested
  Music Box rules — event, priority, cooldown and optional numeric conditions
  like `lossStreak >= 5`. It is deterministic, fully local (nothing is sent),
  and unit-tested; the Music Boxes page exposes an "AI Generate" modal whose
  Apply action materializes the box + rules into the store. A future model can
  swap in behind the same AIGenResult shape without touching the rule engine.
- **Missing/unplayable audio** (§26 "Audio file unavailable"): the audio engine
  wraps every backend play in a try/catch that swallows the failure (returns
  null, no active track) instead of throwing; engine tests prove a missing file
  never crashes the app and that playback recovers immediately afterwards. The
  same guard covers an unavailable *output device* (§26 "Output device
  unavailable"): `DEVICE_UNAVAILABLE` from the backend is swallowed, no track
  is flagged active, and once the device returns the engine resumes playback
  without a restart.
- Status today: **220 tests passing** across 28 test files — core engine /
  adapter unit tests (CS2 + the cross-game LoL adapter),
  IPC (folder scan + persistent log), the GSI HTTP listener, game-process
  detection, Music Box port, the AI generator,
  audio-duration probing (WAV / FLAC / MP3),
  per-adapter §20 legal notes,
  the §19 Music Pack license model (window / territory / rights gating) + badge,
  and renderer page tests
  (Library covers search, category/favorites filters, sort, remove, favorite
  toggle, duration column, per-asset rule-usage count, and the metadata editor —
  open modal, save persisted update, cancel leaves the asset untouched, comma
  separated tags split into an array, a cover-image chooser — a "Browse…"
  button in the editor opens the OS image picker (`gmb:dialog:pick-image`) and
  writes the chosen path into `coverPath`, §5, and a cover thumbnail in the
  list: tracks with `coverPath` render an `<img>` via the privileged
  `appmedia://` protocol, others a music-glyph placeholder, §14 "Cover"; the Rule builder covers the WHEN/IF/THEN
  flow plus drag-a-track-onto-the-slot binding, §14, and a live Advanced JSON
  preview that anchors future JSON/expression editing, §13).
- Start-with-Windows is real: `app.setLoginItemSettings({ openAtLogin })` is
  driven by the `startWithWindows` setting, and `launchMinimized` hides on boot.
- Renderer unit tests can run under Node via jsdom; keep game/audio logic out
  of React components so they stay testable.

---

## 8. Known limitations / roadmap

- **Virtual Microphone** ships as an `AudioMixer → Output` abstraction plus an
  explicit install/consent step in the UI (`VirtualMicSetup` on the Audio page).
  Selecting a virtual-mic output (`virtualMic` / `both`) while the driver is not
  yet installed+confirmed never drops audio or crashes — the core
  `effectiveOutputSinks` honestly falls back to the player's own speakers until
  the user confirms the separate Windows virtual-loopback driver is installed.
- **Packaging (NSIS installer)** requires the electron-builder `winCodeSign`
  cache, which needs an environment with admin rights to create its symlinks.
  In a non-admin/sandboxed shell `npm run build:dir` still emits a runnable
  `release/win-unpacked/Game Music Box.exe` (verified to launch with a healthy
  footprint) but the final signed installer step aborts on the winCodeSign
  symlink family. Run the installer build from a normal admin-capable
  PowerShell, or pre-warm the cache, to produce the `.exe` setup artifact.
- Only CS2 is wired for phase 1; other games are adapter stubs.
- Audio routing to a virtual device (teammates hearing your reaction) is gated
  behind the same virtual-audio component and never touches game anti-cheat.
- Developer/raw event logging exists in the Rules page; CLI flags for verbose
  logging can be added under `GMB_LOG_LEVEL`. Runtime + event log lines are
  additionally persisted to a dated file at `userData/logs/gmb-<YYYY-MM-DD>.log`
  so matches can be traced outside the UI.
- **Grenade family** (`GRENADE_THROW` / `FLASH_THROW` / `SMOKE_THROW`) is now
  detected from CS2 GSI weapon `ammo_reserve` drops at throw time (edge-triggered,
  classified by weapon name). This requires `player_weapons` to be enabled in
  the `gamestate_integration_*.cfg` (see the README GSI snippet).
- **CLUTCH** is detected from the opt-in `allplayers_state` optic: when the
  watched player is the only survivor on their team during a live round (a "1vX"
  clutch), the adapter emits a `CLUTCH` event, edge-triggered once per round and
  re-armed at the next round's freezetime. Requires `allplayers_state` (it is
  already included in the GSI config Games page copy). This uses only the
  officially opt-in GSI HTTP push — no injection, no memory reads.
- Only **MVP** in the canonical model is **not exposed by CS2 GSI** and so is
  reachable only via dev-mode test triggers (not real match data). Detecting MVP
  requires an interface GSI does not provide; per the legal design it is left as
  a documented limitation rather than implemented via invasive readbacks.