import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { AudioAsset } from "@core/library/AudioAsset";
import type { MusicBox, Rule } from "@core/rules/Rule";
import type { SessionSnapshot } from "@core/events/GameEvent";
import type { LogEntry } from "../domain/GameController";
import { buildBoxExport, deserializeBoxExport } from "../domain/boxPort";
import { extractAudioFromFile } from "../audio/videoExtract";
import { bridge } from "../bridge";

export interface DefaultSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  ducking: boolean;
  duckLevel: number;
  /** Mic level 0..1 that must be exceeded to trigger ducking (§7 threshold). */
  duckThreshold: number;
  gsiPort: number;
  autoDetect: boolean;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  launchMinimized: boolean;
  developerMode: boolean;
  /** Where the processed mix is delivered: speaker / both / virtualMic. */
  outputTarget: "speaker" | "both" | "virtualMic";
  /** Whether the separate, opt-in virtual-mic driver is installed + confirmed. */
  virtualMicInstalled: boolean;
  /** UI language code ("en" | "zh"). */
  language: string;
  /** Whether to auto-start game monitoring (GSI + process detect) on launch. */
  startMonitoringGames: boolean;
  /** Whether global reaction hotkeys are registered (Ctrl+Shift+M / P etc.). */
  shortcutsEnabled: boolean;
  /** First-run onboarding was completed. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: DefaultSettings = {
  masterVolume: 0.9,
  musicVolume: 0.8,
  sfxVolume: 1,
  voiceVolume: 1,
  ducking: false,
  duckLevel: 0.2,
  duckThreshold: 0.05,
  gsiPort: 3001,
  autoDetect: true,
  startWithWindows: false,
  minimizeToTray: true,
  launchMinimized: false,
  developerMode: true,
  outputTarget: "speaker",
  virtualMicInstalled: false,
  language: "en",
  startMonitoringGames: true,
  shortcutsEnabled: true,
  onboarded: false,
};

/** User-facing status/error toast. Kinds mirror the §26 UI states. */
export interface Notice {
  id: string;
  kind: "info" | "warn" | "error";
  text: string;
}

/**
 * Default CS2 reaction presets guaranteed by the app on first load. Seeding runs
 * inside the app's own process (renderer storePut → main JsonStore), so it
 * writes reliably to the user's store regardless of where the data dir lives.
 * Idempotent: entries already present by id are left untouched; nothing is
 * removed.
 */
interface Cs2SfxDef {
  id: string;
  file: string;
  title: string;
  duration: number;
}

interface Cs2RuleDef {
  id: string;
  name: string;
  event: Rule["event"];
  priority: number;
  cooldownMs: number;
}

const CS2_SFX: Cs2SfxDef[] = [
  { id: "vx_cs2_round_win_01", file: "vx_cs2_round_win_01.wav", title: "回合胜利", duration: 1.38 },
  { id: "vx_cs2_round_loss_01", file: "vx_cs2_round_loss_01.wav", title: "回合失败", duration: 1.24 },
  { id: "vx_cs2_game_start_01", file: "vx_cs2_game_start_01.wav", title: "游戏开始/换边", duration: 0.55 },
  { id: "vx_cs2_grenade_01", file: "vx_cs2_grenade_01.wav", title: "投掷手雷", duration: 0.7 },
  { id: "vx_cs2_flash_01", file: "vx_cs2_flash_01.wav", title: "闪光弹", duration: 0.28 },
  { id: "vx_cs2_smoke_01", file: "vx_cs2_smoke_01.wav", title: "烟雾弹", duration: 0.8 },
];

const CS2_RULES: Cs2RuleDef[] = [
  { id: "ru_9f1c2e3a4b5d4c6e8a7f9b0c1d2e3f41", name: "回合胜利", event: "ROUND_WIN", priority: 95, cooldownMs: 8000 },
  { id: "ru_1a2b3c4d5e6f4a7b8c9d0e1f2a3b4c52", name: "回合失败", event: "ROUND_LOSS", priority: 90, cooldownMs: 8000 },
  { id: "ru_3c4d5e6f7a8b4c9d0e1f2a3b4c5d6e63", name: "游戏开始/换边准备", event: "GAME_START", priority: 20, cooldownMs: 5000 },
  { id: "ru_5e6f7a8b9c0d4e1f2a3b4c5d6e7f8a74", name: "投掷手雷", event: "GRENADE_THROW", priority: 30, cooldownMs: 1200 },
  { id: "ru_abc1234567894def0a1b2c3d4e5f6a85", name: "闪光弹", event: "FLASH_THROW", priority: 30, cooldownMs: 1200 },
  { id: "ru_def456789abc4f0123456789abcdef96", name: "烟雾弹", event: "SMOKE_THROW", priority: 30, cooldownMs: 1200 },
];

async function ensureCs2Defaults(
  current: { assets: AudioAsset[]; boxes: MusicBox[]; rules: Rule[] },
): Promise<{ assets: AudioAsset[]; boxes: MusicBox[]; rules: Rule[] }> {
  const dataDir = await bridge.dataDir();
  const audioDir = `${dataDir}/audio`.replace(/\//g, "\\");
  const now = Date.now();

  const assets = [...current.assets];
  const rules = [...current.rules];
  const haveAsset = new Set(assets.map((a) => a.id));
  const haveRule = new Set(rules.map((r) => r.id));

  for (const s of CS2_SFX) {
    if (haveAsset.has(s.id)) continue;
    const asset: AudioAsset = {
      id: s.id,
      filePath: `${audioDir}/${s.file}`,
      title: s.title,
      artist: "",
      album: "",
      duration: s.duration,
      genre: "",
      tags: ["cs2-sfx"],
      category: "imported",
      volume: 1,
      favorite: false,
      addedAt: now,
      playCount: 0,
    };
    const saved = (await bridge.storePut("assets", asset as any)) as AudioAsset;
    assets.push(saved);
  }

  const eventAssetId: Record<string, string> = {
    ROUND_WIN: "vx_cs2_round_win_01",
    ROUND_LOSS: "vx_cs2_round_loss_01",
    GAME_START: "vx_cs2_game_start_01",
    GRENADE_THROW: "vx_cs2_grenade_01",
    FLASH_THROW: "vx_cs2_flash_01",
    SMOKE_THROW: "vx_cs2_smoke_01",
  };
  for (const r of CS2_RULES) {
    if (haveRule.has(r.id)) continue;
    const rule: Rule = {
      id: r.id,
      name: r.name,
      game: "cs2",
      event: r.event,
      conditions: [],
      action: { type: "PLAY_AUDIO", assetId: eventAssetId[r.event] },
      priority: r.priority,
      cooldownMs: r.cooldownMs,
      route: "BOTH",
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const saved = (await bridge.storePut("rules", rule as any)) as Rule;
    rules.push(saved);
  }

  let boxes = [...current.boxes];
  const sixIds = CS2_RULES.map((r) => r.id);
  const target = boxes.find((b) => b.game === "cs2") ?? boxes[0];
  if (target) {
    const merged = [...new Set([...target.rules, ...sixIds])];
    if (merged.length !== target.rules.length) {
      const box: MusicBox = { ...target, rules: merged, updatedAt: now };
      const saved = (await bridge.storePut("boxes", box as any)) as MusicBox;
      boxes = boxes.map((b) => (b.id === box.id ? saved : b));
    }
  } else {
    const box: MusicBox = {
      id: uuid(),
      name: "默认 CS2",
      description: "",
      game: "cs2",
      rules: sixIds,
      volume: 0.8,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
    const saved = (await bridge.storePut("boxes", box as any)) as MusicBox;
    boxes.push(saved);
  }

  return { assets, boxes, rules };
}

export interface AppState {
  ready: boolean;
  assets: AudioAsset[];
  boxes: MusicBox[];
  rules: Rule[];
  settings: DefaultSettings;
  session: SessionSnapshot;
  log: LogEntry[];
  notices: Notice[];
  playing: { title: string } | null;
  gameConnected: boolean;
  /** League client presence (§3 LoL adapter) — drives the Games page indicator. */
  lcuConnected: boolean;
  /** Reaction playback is globally paused (tray / shortcut / player button). */
  paused: boolean;

  // bootstrap
  init: () => Promise<void>;
  // assets
  importFiles: (files: { path: string; name: string; size: number }[]) => Promise<void>;
  /** Show a video picker and import each selection as an asset whose audio track is extracted to a WAV. */
  importFromVideo: () => Promise<{ ok: number; failed: string[] }>;
  removeAsset: (id: string) => Promise<void>;
  updateAsset: (id: string, patch: Partial<AudioAsset>) => Promise<void>;
  // boxes & rules
  saveBox: (box: MusicBox) => Promise<void>;
  removeBox: (id: string) => Promise<void>;
  saveRule: (rule: Rule) => Promise<void>;
  removeRule: (id: string) => Promise<void>;
  exportBox: (id: string) => Promise<void>;
  importBoxFromFile: () => Promise<void>;
  // settings
  saveSettings: (patch: Partial<DefaultSettings>) => Promise<void>;
  // notices
  pushNotice: (n: Omit<Notice, "id">) => void;
  dismissNotice: (id: string) => void;
  // logs
  pushLog: (e: LogEntry) => void;
  clearLog: () => void;
  onPlaying: (info: { title: string } | null) => void;
  onSession: (s: SessionSnapshot) => void;
  onConnection: (c: boolean) => void;
  onLcuConnection: (c: boolean) => void;
  /** Pause/resume all game reactions (tray / shortcut / player button). */
  setPaused: (paused: boolean) => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
  paused: false,
  assets: [],
  boxes: [],
  rules: [],
  settings: DEFAULT_SETTINGS,
  session: {
    kills: 0, deaths: 0, assists: 0, wins: 0, losses: 0,
    roundsWon: 0, roundsLost: 0, winStreak: 0, lossStreak: 0,
    health: 100, matchPoint: false, gamePhase: "idle",
  },
  log: [],
  notices: [],
  playing: null,
  gameConnected: false,
  lcuConnected: false,

  init: async () => {
    const [settings, assets, boxes, rules] = await Promise.all([
      bridge.settingsGet(),
      bridge.storeAll("assets"),
      bridge.storeAll("boxes"),
      bridge.storeAll("rules"),
    ]);
    const seeded = await ensureCs2Defaults({
      assets: assets as AudioAsset[],
      boxes: boxes as MusicBox[],
      rules: rules as Rule[],
    });
    set({
      settings: { ...DEFAULT_SETTINGS, ...(settings as any) },
      assets: seeded.assets,
      boxes: seeded.boxes,
      rules: seeded.rules,
      ready: true,
    });
  },

  importFiles: async (files) => {
    for (const f of files) {
      const id = uuid();
      const meta = await bridge.readAudioMeta(f.path);
      const asset: AudioAsset = {
        id,
        filePath: f.path,
        title: stripExt(f.name),
        artist: "",
        album: "",
        duration: meta.duration,
        genre: "",
        tags: [],
        category: "imported",
        volume: 1,
        favorite: false,
        addedAt: Date.now(),
        playCount: 0,
      };
      const saved = (await bridge.storePut("assets", asset as any)) as AudioAsset;
      set({ assets: [...get().assets, saved] });
    }
  },

  importFromVideo: async () => {
    const files = await bridge.openVideoFiles();
    let ok = 0;
    const failed: string[] = [];
    for (const f of files) {
      const id = uuid();
      try {
        const url = await bridge.toMediaUrl(f.path);
        const bytes = await (await fetch(url)).arrayBuffer();
        const { wav, duration } = await extractAudioFromFile(bytes);
        const savedPath = await bridge.saveExtractedAudio(`${id}.wav`, wav);
        const asset: AudioAsset = {
          id,
          filePath: savedPath,
          title: stripExt(f.name),
          artist: "",
          album: "",
          duration,
          genre: "",
          tags: ["video"],
          category: "imported",
          volume: 1,
          favorite: false,
          addedAt: Date.now(),
          playCount: 0,
        };
        const saved = (await bridge.storePut("assets", asset as any)) as AudioAsset;
        set({ assets: [...get().assets, saved] });
        ok++;
      } catch (err) {
        console.error("Import from video failed:", f.name, err);
        failed.push(stripExt(f.name));
      }
    }
    return { ok, failed };
  },

  removeAsset: async (id) => {
    await bridge.storeRemove("assets", id);
    set({ assets: get().assets.filter((a) => a.id !== id) });
  },

  updateAsset: async (id, patch) => {
    const existing = get().assets.find((a) => a.id === id);
    if (!existing) return;
    const updated = { ...existing, ...patch, id };
    await bridge.storePut("assets", updated as any);
    set({
      assets: get().assets.map((a) => (a.id === id ? updated : a)),
    });
  },

  saveBox: async (box) => {
    const next = { ...box, id: box.id || uuid(), updatedAt: Date.now() };
    await bridge.storePut("boxes", next as any);
    const exists = get().boxes.some((b) => b.id === next.id);
    set({
      boxes: exists
        ? get().boxes.map((b) => (b.id === next.id ? next : b))
        : [...get().boxes, next],
    });
  },

  removeBox: async (id) => {
    await bridge.storeRemove("boxes", id);
    set({ boxes: get().boxes.filter((b) => b.id !== id) });
  },

  saveRule: async (rule) => {
    const next = { ...rule, id: rule.id || uuid() };
    await bridge.storePut("rules", next as any);
    set({
      rules: get().rules.some((r) => r.id === next.id)
        ? get().rules.map((r) => (r.id === next.id ? next : r))
        : [...get().rules, next],
    });
  },

  removeRule: async (id) => {
    await bridge.storeRemove("rules", id);
    set({ rules: get().rules.filter((r) => r.id !== id) });
  },

  exportBox: async (id) => {
    const box = get().boxes.find((b) => b.id === id);
    if (!box) return;
    const payload = buildBoxExport(box, get().rules);
    const safeName = (box.name || "music-box").replace(/[\\/:*?"<>|]/g, "_");
    await bridge.exportJson(`${safeName}.gmb.json`, JSON.stringify(payload, null, 2));
  },

  importBoxFromFile: async () => {
    const file = await bridge.importJson();
    if (!file) return;
    const parsed = deserializeBoxExport(file.content);
    if (!parsed) {
      alert("That file isn't a valid Game Music Box export.");
      return;
    }
    for (const r of parsed.rules) await get().saveRule(r);
    await get().saveBox(parsed.box);
  },

  saveSettings: async (patch) => {
    const next = { ...get().settings, ...patch };
    set({ settings: next });
    await bridge.settingsSave(next as any);
  },

  pushLog: (e) => {
    // Persist runtime/event log to a dated file (§2 "日志" / §16 Event logging).
    void bridge.appendLog({ ts: e.ts, kind: e.kind, message: e.message });
    set({ log: [...get().log, e].slice(-200) });
  },
  clearLog: () => set({ log: [] }),
  pushNotice: (n) => set({ notices: [...get().notices, { id: uuid(), ...n }].slice(-5) }),
  dismissNotice: (id) => set({ notices: get().notices.filter((x) => x.id !== id) }),
  onPlaying: (info) => set({ playing: info }),
  onSession: (s) => set({ session: s }),
  onConnection: (c) => set({ gameConnected: c }),
  onLcuConnection: (c) => set({ lcuConnected: c }),

  /**
   * Pause/resume all game reactions. Mirrors into the controller (stops audio,
   * suppresses new fires) and tells the tray so its menu label stays accurate.
   */
  setPaused: async (paused) => {
    set({ paused });
    void bridge.sendReactionPaused(paused);
  },
}));

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}