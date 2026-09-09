# Game Music Box — Legal & Compatibility Notes

> This document is maintained per-game and per-feature. It is **engineering
> intent**, not legal advice. For any commercial/licensing decision, consult a
> qualified professional for your actual operating regions.

## 0. Product positioning & anti-cheat stance

Game Music Box is a **game companion / accessibility / entertainment utility**,
**not a cheat**. The codebase therefore refuses, by design:

- DLL injection, game-process memory reading, hooking internal functions,
- modifying the game client, its executables or core files,
- bypassing anti-cheat, EULA, ToS, or platform API policies.

Anything that *would* require such techniques is **not implemented** and is
recorded as a known limitation below instead.

## 1. Per-game notes

### CS2 (Valve)

| Item | Status / Note |
| --- | --- |
| Supported interface | **Game State Integration (GSI)** — an official, opt-in HTTP/JSON hook the game itself pushes to. No memory access. |
| Terms checked | GSI is a publicly documented, non-cheat, always permitted state feed. |
| Anti-cheat considerations | None triggered: we are a passive HTTP receiver on localhost, we never touch the game process. |
| Data collected | Read-only: provider info, map phase, round phase/win team, player health/kills. Stored locally only. |
| Known limitations | GSI reacts with integration/chunk granularity; sub-second "utility" events (exact flash origin) are inferred, not observed. Bomb/mvp timings are approximated from round phase state. |

### Future titles (planning)

- **VALORANT / aWin / others** — integrate only via their official, legal
  local state/event interfaces (REST/event stream or skew reads with a public
  API). No memory reading, no driver tricks. Each adapter gets its own row here
  before it ships.
- **PUBG / Apex / LoL** — same rule: legal state interface or explicitly not
  supported. "Modding is allowed" does **not** imply an app is allowed; EULA,
  anti-cheat and API policies are checked per title.

## 2. User-imported music — by design

**Phase-1 content model = Local File Reference:**

- Users pick files on disk with a file dialog. The app stores the **path and
  metadata only**; it never copies music into the app directory, never uploads
  it, and never shares it.
- The app does **not** crawl/ingest YouTube, TikTok, Bilibili, Spotify, NetEase,
  QQ Music, Apple Music or any other site, and has no "download popular songs"
  feature.

**What the app provides:** playback, management, categorization, event binding,
audio routing and rule evaluation — the *tooling*, not the library.

**What is NOT done (and must stay NOT done):** bundling or redistributing
third-party copyrighted tracks (hot singles, TikTok/BGM, movie/anime/OST
music), including "short clips only" reasoning — playing a few seconds does not
grant rights; no packaging of other users' uploads into Music Packs; no server
storage or re-distribution; no commercial sale.

## 3. Future official Music Packs — license attribution fields

If we ever ship official packs, every track must carry and verify:

```
Track  · Artist  · Album
Copyright Owner
License Type
Territory
Start Date · End Date
Commercial Use
Distribution Rights
Synchronization Rights
Public Performance / Communication Rights
```

Rights scope is **never assumed** by the developer; it is confirmed by a legal
review for the actual operating regions and usage. The UI may only show
"Licensed for Game Music Box" after such authorization is actually obtained.

## 4. Virtual microphone & audio routing

- The `AudioMixer → Output` abstraction exists today (`SELF_ONLY /
  TEAMMATES / BOTH`).
- *Actual* virtual-loopback output requires a **separately installed Windows
  audio driver**; it is designed as an independent component, and the UI must
  explicitly disclose the install step and system permissions it needs.
- This feature only feeds the user's **own voice + audio** into a virtual mic.
  It never bypasses game voice, anti-cheat, or platform permission controls,
  and it must not be used to spam or harass. Teams/communities may have
  additional conduct rules — the user is responsible for respecting them.

## 5. Privacy (local-first)

- Music files: local. Game state: local. Rules & settings: local.
- **Default = no network egress.** No telemetry, no analytics, no uploads.
- Future AI features (music-box generator, not core event detection) will ask
  the user explicitly before sending anything, and never send game data, music
  files or mic audio by default.

## 6. Escalation rule

If a requested feature would conflict with any of the above (touch anti-cheat,
violate a game's terms, redistribute unlicensed audio, or require driver
privileges without user consent), we **stop and record it as a technical/legal
limitation** instead of half-implementing a risky workaround.