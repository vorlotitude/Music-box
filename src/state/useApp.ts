import { create } from "zustand";
import { v4 as uuid } from "uuid";
import type { AudioAsset } from "@core/library/AudioAsset";
import type { MusicBox, Rule } from "@core/rules/Rule";
import type { SessionSnapshot } from "@core/events/GameEvent";
import type { LogEntry } from "../domain/GameController";
import { buildBoxExport, deserializeBoxExport } from "../domain/boxPort";
import { bridge } from "../bridge";

export interface DefaultSettings {
  masterVolume: number;
  musicVolume: number;
  sfxVolume: number;
  voiceVolume: number;
  ducking: boolean;
  duckLevel: number;
  gsiPort: number;
  autoDetect: boolean;
  startWithWindows: boolean;
  minimizeToTray: boolean;
  launchMinimized: boolean;
  developerMode: boolean;
  /** Where the processed mix is delivered: speaker / both / virtualMic. */
  outputTarget: "speaker" | "both" | "virtualMic";
}

export const DEFAULT_SETTINGS: DefaultSettings = {
  masterVolume: 0.9,
  musicVolume: 0.8,
  sfxVolume: 1,
  voiceVolume: 1,
  ducking: false,
  duckLevel: 0.2,
  gsiPort: 3001,
  autoDetect: true,
  startWithWindows: false,
  minimizeToTray: true,
  launchMinimized: false,
  developerMode: true,
  outputTarget: "speaker",
};

export interface AppState {
  ready: boolean;
  assets: AudioAsset[];
  boxes: MusicBox[];
  rules: Rule[];
  settings: DefaultSettings;
  session: SessionSnapshot;
  log: LogEntry[];
  playing: { title: string } | null;
  gameConnected: boolean;

  // bootstrap
  init: () => Promise<void>;
  // assets
  importFiles: (files: { path: string; name: string; size: number }[]) => Promise<void>;
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
  // logs
  pushLog: (e: LogEntry) => void;
  clearLog: () => void;
  onPlaying: (info: { title: string } | null) => void;
  onSession: (s: SessionSnapshot) => void;
  onConnection: (c: boolean) => void;
}

export const useApp = create<AppState>((set, get) => ({
  ready: false,
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
  playing: null,
  gameConnected: false,

  init: async () => {
    const [settings, assets, boxes, rules] = await Promise.all([
      bridge.settingsGet(),
      bridge.storeAll("assets"),
      bridge.storeAll("boxes"),
      bridge.storeAll("rules"),
    ]);
    set({
      settings: { ...DEFAULT_SETTINGS, ...(settings as any) },
      assets: assets as AudioAsset[],
      boxes: boxes as MusicBox[],
      rules: rules as Rule[],
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

  pushLog: (e) => set({ log: [...get().log, e].slice(-200) }),
  clearLog: () => set({ log: [] }),
  onPlaying: (info) => set({ playing: info }),
  onSession: (s) => set({ session: s }),
  onConnection: (c) => set({ gameConnected: c }),
}));

function stripExt(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}