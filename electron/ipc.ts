import { ipcMain, dialog, BrowserWindow, app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { JsonStore, CollectionName } from "./store/JsonStore";
import { probeDuration } from "./media/meta";

export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"];

export const VIDEO_EXTENSIONS = [
  "mp4", "m4v", "mkv", "mov", "webm", "avi", "flv", "wmv",
  "mpg", "mpeg", "ts", "3gp", "ogv",
];

export interface IpcDeps {
  store: JsonStore;
  getWindow: () => BrowserWindow | null;
  /** Called after any settings change so main can re-apply OS-facing behavior. */
  onSettingsChanged?: () => void;
  /** Reflect the live tray "Pause Reaction" label from the renderer's state. */
  setReactPaused?: (paused: boolean) => void;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { store, getWindow } = deps;

  // Reflect the renderer's live reaction-paused state into the tray menu.
  ipcMain.handle("gmb:reaction:set", (_e, paused: boolean) => {
    deps.setReactPaused?.(paused === true);
  });

  // Grant a transient user activation so HTMLMediaElement.setSinkId can actually
  // switch output to the virtual CABLE mic. Chromium requires a user gesture to
  // select a non-default output device; the reaction autoplays with no gesture,
  // so we synthesize a benign keystroke here (no app hotkey is a bare "X").
  ipcMain.handle("gmb:grant-activation", () => {
    const win = getWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.sendInputEvent({ type: "keyDown", keyCode: "X" });
      win.webContents.sendInputEvent({ type: "keyUp", keyCode: "X" });
    }
    return true;
  });

  ipcMain.handle("gmb:version", () => process.env.npm_package_version ?? "0.1.0");

  ipcMain.handle("gmb:data-dir", () => store.getPath());

  // ---- Runtime log (persisted to a dated file under userData/logs) ----
  ipcMain.handle("gmb:log:append", (_e, entry: { ts?: number; kind?: string; message?: string }) => {
    appendFileLog(entry);
  });

  // ---- Store ----
  ipcMain.handle("gmb:store:all", (_e, c: CollectionName) => store.all(c));
  ipcMain.handle("gmb:store:get", (_e, c: CollectionName, id: string) => store.get(c, id));
  ipcMain.handle("gmb:store:put", (_e, c: CollectionName, doc: { id?: string }) => {
    const id = doc?.id;
    if (!id) throw new Error("store:put requires a doc.id");
    store.put(c, id, doc);
    return store.get(c, id);
  });
  ipcMain.handle("gmb:store:remove", (_e, c: CollectionName, id: string) => {
    store.remove(c, id);
  });
  ipcMain.handle("gmb:store:clear", (_e, c: CollectionName) => store.clear(c));

  // ---- Settings ----
  ipcMain.handle("gmb:settings:get", () => store.get("settings", "main") ?? {});
  ipcMain.handle("gmb:settings:save", (_e, s: Record<string, unknown>) => {
    store.put("settings", "main", { ...(store.get("settings", "main") ?? {}), ...s });
    const win = getWindow();
    win?.webContents.send("gmb:settings-changed", s);
    deps.onSettingsChanged?.();
    return store.get("settings", "main");
  });

  // ---- Dialogs ----
  ipcMain.handle("gmb:dialog:open-audio", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: "Import audio",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Audio", extensions: AUDIO_EXTENSIONS }],
    });
    if (res.canceled) return [];
    return res.filePaths.map((p) => {
      const stat = fs.statSync(p);
      return { path: p, name: path.basename(p), size: stat.size };
    });
  });

  ipcMain.handle("gmb:dialog:pick-directory", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: "Import audio folder",
      properties: ["openDirectory"],
    });
    if (res.canceled) return null;
    return res.filePaths[0];
  });

  // Pick a video whose audio track should be extracted into a music asset.
  ipcMain.handle("gmb:dialog:open-video", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: "Import video (extract audio)",
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "Video", extensions: VIDEO_EXTENSIONS }],
    });
    if (res.canceled) return [];
    return res.filePaths.map((p) => {
      const stat = fs.statSync(p);
      return { path: p, name: path.basename(p), size: stat.size };
    });
  });

  // Persist an editor-extracted WAV (from a video) into userData/audio so the
  // asset does not depend on the source video file. fileName is sanitized to a
  // bare basename to prevent path traversal.
  ipcMain.handle("gmb:audio:save-extracted", async (_e, fileName: string, bytes: ArrayBuffer | Uint8Array) => {
    const safe = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const dir = path.join(store.getPath(), "audio");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, safe);
    fs.writeFileSync(out, Buffer.from(bytes as ArrayBuffer));
    return out;
  });

  // Pick a local image used as an audio asset's cover (§5 "set cover").
  ipcMain.handle("gmb:dialog:pick-image", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: "Select cover image",
      properties: ["openFile"],
      filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "bmp", "gif"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("gmb:dir:scan-audio", async (_e, dir: string) => {
    return scanAudioDir(dir, 0);
  });

  ipcMain.handle("gmb:audio:meta", async (_e, p: string) => {
    try {
      const stat = fs.statSync(p);
      const duration = probeDuration(p);
      return { duration, bytes: stat.size };
    } catch {
      return { duration: undefined, bytes: 0 };
    }
  });

  ipcMain.handle("gmb:media:url", (_e, p: string) => {
    // Custom scheme served by the privileged protocol handler, same process.
    return `appmedia://local/${encodeURIComponent(p)}`;
  });

  // ---- Music Box JSON export / import ----
  ipcMain.handle("gmb:file:export-json", async (_e, defaultName: string, content: string) => {
    const win = getWindow();
    const res = await dialog.showSaveDialog(win!, {
      title: "Export Music Box",
      defaultPath: defaultName,
      filters: [{ name: "Game Music Box", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePath) return false;
    fs.writeFileSync(res.filePath, content, "utf-8");
    return true;
  });

  ipcMain.handle("gmb:file:import-json", async () => {
    const win = getWindow();
    const res = await dialog.showOpenDialog(win!, {
      title: "Import Music Box",
      properties: ["openFile"],
      filters: [{ name: "Game Music Box", extensions: ["json"] }],
    });
    if (res.canceled || !res.filePaths[0]) return null;
    return { name: path.basename(res.filePaths[0]), content: fs.readFileSync(res.filePaths[0], "utf-8") };
  });

  // ---- Window controls ----
  ipcMain.handle("gmb:window:minimize", () => getWindow()?.minimize());
  ipcMain.handle("gmb:window:close", () => getWindow()?.close());
}

/** Build a single human-readable log line (time + kind + message). */
export function formatLogLine(entry: { ts?: number; kind?: string; message?: string }): string {
  const ts = entry.ts ?? Date.now();
  const time = new Date(ts).toISOString();
  const kind = entry.kind ?? "info";
  return `${time}  ${kind.padEnd(8)}  ${entry.message ?? ""}`;
}

/** Append a line to today's dated log file under the given logs directory. */
export function appendLogLine(logsDir: string, entry: { ts?: number; kind?: string; message?: string }): void {
  fs.mkdirSync(logsDir, { recursive: true });
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(logsDir, `gmb-${day}.log`);
  fs.appendFileSync(file, formatLogLine(entry) + "\n", "utf-8");
}

/** Default persistent logger: userData/logs/gmb-<date>.log. Never throws (§26). */
export function appendFileLog(entry: { ts?: number; kind?: string; message?: string }): void {
  try {
    appendLogLine(path.join(app.getPath("userData"), "logs"), entry);
  } catch {
    // Logging must never crash the app.
  }
}

/** Recursively collect audio files under a directory (bounded depth). */
export function scanAudioDir(dir: string, depth: number, out: { path: string; name: string; size: number }[] = []): { path: string; name: string; size: number }[] {
  if (depth > 6) return out;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      scanAudioDir(full, depth + 1, out);
    } else if (e.isFile() && AUDIO_EXTENSIONS.includes(path.extname(e.name).slice(1).toLowerCase())) {
      try {
        out.push({ path: full, name: e.name, size: fs.statSync(full).size });
      } catch {
        // unreadable file — skip
      }
    }
  }
  return out;
}