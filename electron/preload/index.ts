import { contextBridge, ipcRenderer } from "electron";

/**
 * The safe, typed surface the renderer is allowed to use.
 * `contextIsolation` stays ON — renderer never touches Node directly.
 * The global `window.gmb` is consumed by src/bridge.ts.
 */

const api = {
  version: () => ipcRenderer.invoke("gmb:version") as Promise<string>,
  dataDir: () => ipcRenderer.invoke("gmb:data-dir") as Promise<string>,

  // GSI / game push events (main -> renderer)
  onRawPayload: (cb: (payload: Record<string, unknown>) => void) => {
    ipcRenderer.on("gmb:raw-payload", (_e, p) => cb(p));
  },
  onGameRunning: (cb: (running: boolean) => void) => {
    ipcRenderer.on("gmb:game-running", (_e, r) => cb(r));
  },

  // Store (CRUD)
  storeAll: (c: string) => ipcRenderer.invoke("gmb:store:all", c),
  storeGet: (c: string, id: string) => ipcRenderer.invoke("gmb:store:get", c, id),
  storePut: (c: string, doc: Record<string, unknown>) =>
    ipcRenderer.invoke("gmb:store:put", c, doc),
  storeRemove: (c: string, id: string) =>
    ipcRenderer.invoke("gmb:store:remove", c, id),
  storeClear: (c: string) => ipcRenderer.invoke("gmb:store:clear", c),

  // Settings
  settingsGet: () => ipcRenderer.invoke("gmb:settings:get"),
  settingsSave: (s: Record<string, unknown>) => ipcRenderer.invoke("gmb:settings:save", s),

  // Dialog / filesystem
  openAudioFiles: () => ipcRenderer.invoke("gmb:dialog:open-audio") as Promise<
    { path: string; name: string; size: number }[]
  >,
  pickDirectory: () => ipcRenderer.invoke("gmb:dialog:pick-directory") as Promise<string | null>,
  scanDirectory: (dir: string) => ipcRenderer.invoke("gmb:dir:scan-audio", dir) as Promise<
    { path: string; name: string; size: number }[]
  >,
  readAudioMeta: (p: string) => ipcRenderer.invoke("gmb:audio:meta", p) as Promise<{
    duration?: number;
  }>,
  toMediaUrl: (absPath: string) => ipcRenderer.invoke("gmb:media:url", absPath) as Promise<string>,

  // Music Box JSON export / import
  exportJson: (defaultName: string, content: string) =>
    ipcRenderer.invoke("gmb:file:export-json", defaultName, content) as Promise<boolean>,
  importJson: () => ipcRenderer.invoke("gmb:file:import-json") as Promise<{ name: string; content: string } | null>,

  // App control
  minimize: () => ipcRenderer.invoke("gmb:window:minimize"),
  close: () => ipcRenderer.invoke("gmb:window:close"),
};

contextBridge.exposeInMainWorld("gmb", api);

export type GmBridge = typeof api;