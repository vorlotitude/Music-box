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
  store/JsonStore.ts     JSON-file store (id-keyed documents per collection)
  preload/index.ts       contextBridge → window.gmb
core/            Game-agnostic engines (pure TS, unit tested)
  events/GameEvent.ts    Universal Game Event + SessionSnapshot types
  adapters/GameAdapter.ts      adapter interface (cross-game contract)
  adapters/cs2/CS2Adapter.ts   CS2 GSI → Universal events + test triggers
  engine/EventEngine.ts  session bookkeeping (streaks, kills, low HP, …)
  engine/RuleEngine.ts   WHEN/IF/THEN matching + priority + cooldown
  rules/Rule.ts          Rule / Condition / Action types
  library/AudioAsset.ts  audio asset model
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

- `core/src/**/*.test.ts` covers: CS2 payload → events, event engine session
  bookkeeping, rule matching/priority/cooldown, and audio priority/fade/duck.
- **Closed-loop integration tests** live in `core/src/integration/closedLoop.test.ts`.
  They wire all four layers — `CS2Adapter → EventEngine → RuleEngine →
  AudioEngine` — with a fake audio backend and assert the real end-to-end
  behavior: asset binding on a win, silence when unbound, priority-conflict
  resolution, cooldown blocking, `winStreak >= 3` conditions, and mic-ducking.
- **Application-layer test** `src/domain/GameController.test.ts` drives the
  *real* `GameController` (the same instance the UI boots) with an injected
  fake store bridge + fake audio backend. It proves the full user workflow —
  import music (seed store) → create rule (seed store) → GSI event via the
  same `onRawPayload` seam the main process uses → Event → Rule → AudioEngine
  → play — plus dev-mode `testEvent()`, silence-when-unbound, and graceful
  handling of a missing audio file.
- Dev-mode test events (`TEST ROUND WIN/LOSS … BOMB PLANT`) are covered at the
  adapter level (every Home label normalizes to its matching event) and at the
  app layer (a `BOMB PLANT` trigger fires a `BOMB_PLANTED` rule).
- Status today: **46 tests passing** (27 unit + 6 closed-loop + 7 application
  + 3 main-process folder-scan + 3 Music Box port).
- Renderer unit tests can run under Node via jsdom; keep game/audio logic out
  of React components so they stay testable.

---

## 8. Known limitations / roadmap

- **Virtual Microphone** is architected (an `AudioMixer → Output` abstraction)
  but not yet implemented; it requires a separate Windows virtual-loopback
  driver component and an explicit install/consent step in the UI.
- Only CS2 is wired for phase 1; other games are adapter stubs.
- Audio routing to a virtual device (teammates hearing your reaction) is gated
  behind the same virtual-audio component and never touches game anti-cheat.
- Developer/raw event logging exists in the Rules page; CLI flags for verbose
  logging can be added under `GMB_LOG_LEVEL`.