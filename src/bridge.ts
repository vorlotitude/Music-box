/**
 * Typed bridge to the Electron main process.
 * When running under plain Vite (no Electron), falls back to an in-memory mock
 * so the UI can be developed/rendered in a normal browser.
 */

export interface MediaFile {
  path: string;
  name: string;
  size: number;
}

/** A single persistently-written runtime log line. */
export interface LogLine {
  ts?: number;
  kind?: string;
  message?: string;
}

export interface GmBridge {
  version: () => Promise<string>;
  dataDir: () => Promise<string>;
  storeAll: (c: string) => Promise<unknown[]>;
  storeGet: (c: string, id: string) => Promise<unknown>;
  storePut: (c: string, doc: Record<string, unknown>) => Promise<unknown>;
  storeRemove: (c: string, id: string) => Promise<void>;
  storeClear: (c: string) => Promise<void>;
  settingsGet: () => Promise<Record<string, unknown>>;
  settingsSave: (s: Record<string, unknown>) => Promise<Record<string, unknown>>;
  openAudioFiles: () => Promise<MediaFile[]>;
  pickDirectory: () => Promise<string | null>;
  /** Pick a video file whose audio track is then extracted into a music asset. */
  openVideoFiles: () => Promise<MediaFile[]>;
  /** Persist an editor-extracted WAV bytes to a writable userData path; returns its abs path. */
  saveExtractedAudio: (fileName: string, bytes: ArrayBuffer | Uint8Array) => Promise<string>;
  /** Pick a single local image (cover art) and return its absolute path. */
  pickImage: () => Promise<string | null>;
  scanDirectory: (dir: string) => Promise<MediaFile[]>;
  readAudioMeta: (p: string) => Promise<{ duration?: number; bytes?: number }>;
  toMediaUrl: (absPath: string) => Promise<string>;
  exportJson: (defaultName: string, content: string) => Promise<boolean>;
  importJson: () => Promise<{ name: string; content: string } | null>;
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  /** Commands pushed from the main process (tray / global shortcuts). */
  onCommand: (cb: (cmd: { kind: string; to?: string }) => void) => void;
  /** Report the live reaction-paused state so the tray menu label stays accurate. */
  sendReactionPaused: (paused: boolean) => Promise<void>;
  appendLog: (entry: LogLine) => Promise<void>;
  onRawPayload: (cb: (payload: Record<string, unknown>) => void) => void;
  onGameRunning: (cb: (running: boolean) => void) => void;
  /** League LCU snapshot ticks pushed from the main process (§3 LoL adapter transport). */
  onLcuPayload: (cb: (snap: Record<string, unknown>) => void) => void;
  /** League client process presence (drives the Games page connection indicator). */
  onLcuRunning: (cb: (running: boolean) => void) => void;
  onLog: (cb: (entry: { ts: number; msg: string }) => void) => void;
  /** Grant a transient user activation so setSinkId can switch output to the virtual mic. */
  grantUserActivation: () => Promise<boolean>;
}

declare global {
  interface Window {
    gmb?: GmBridge;
  }
}

function memoryStore(): Pick<GmBridge, "storeAll" | "storeGet" | "storePut" | "storeRemove" | "storeClear"> {
  const data = new Map<string, Record<string, unknown>>();
  return {
    storeAll: async (c) => [...((data.get(c) ?? {}) as any).values()] as unknown[],
    storeGet: async (c, id) => (data.get(c) as any)?.[id],
    storePut: async (c, doc) => {
      const col = data.get(c) ?? {};
      col[doc.id as string] = doc;
      data.set(c, col);
      return doc;
    },
    storeRemove: async (c, id) => {
      const col = data.get(c) ?? {};
      delete col[id];
    },
    storeClear: async (c) => {
      data.set(c, {});
    },
  };
}

function createMock(): GmBridge {
  const mem = memoryStore();
  let settings: Record<string, unknown> = {};
  return {
    version: async () => "0.1.0 (browser)",
    dataDir: async () => "mock://data",
    ...mem,
    settingsGet: async () => settings,
    settingsSave: async (s) => {
      settings = { ...settings, ...s };
      return settings;
    },
    openAudioFiles: async () => [],
    pickDirectory: async () => null,
    openVideoFiles: async () => [],
    saveExtractedAudio: async (fileName) => `mock://audio/${fileName}`,
    pickImage: async () => null,
    scanDirectory: async () => [],
    readAudioMeta: async () => ({ duration: undefined }),
    toMediaUrl: async (p) => p,
    exportJson: async () => true,
    importJson: async () => null,
    minimize: async () => void 0,
    close: async () => void 0,
    onCommand: () => void 0,
    sendReactionPaused: async () => void 0,
    appendLog: async () => void 0,
    onRawPayload: () => void 0,
    onGameRunning: () => void 0,
    onLcuPayload: () => void 0,
    onLcuRunning: () => void 0,
    onLog: () => void 0,
    grantUserActivation: async () => true,
  };
}

export const bridge: GmBridge =
  typeof window !== "undefined" && window.gmb
    ? window.gmb
    : createMock();

/** True when running inside real Electron (has IPC). */
export const isElectron = !!(
  typeof window !== "undefined" && window.gmb
);