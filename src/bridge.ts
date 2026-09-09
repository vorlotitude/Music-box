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
  readAudioMeta: (p: string) => Promise<{ duration?: number; bytes?: number }>;
  toMediaUrl: (absPath: string) => Promise<string>;
  minimize: () => Promise<void>;
  close: () => Promise<void>;
  onRawPayload: (cb: (payload: Record<string, unknown>) => void) => void;
  onGameRunning: (cb: (running: boolean) => void) => void;
  onLog: (cb: (entry: { ts: number; msg: string }) => void) => void;
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
    readAudioMeta: async () => ({ duration: undefined }),
    toMediaUrl: async (p) => p,
    minimize: async () => void 0,
    close: async () => void 0,
    onRawPayload: () => void 0,
    onGameRunning: () => void 0,
    onLog: () => void 0,
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