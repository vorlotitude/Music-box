import { ipcMain, dialog, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";
import { JsonStore, CollectionName } from "./store/JsonStore";

export const AUDIO_EXTENSIONS = ["mp3", "wav", "flac", "ogg", "m4a", "aac", "wma"];

export interface IpcDeps {
  store: JsonStore;
  getWindow: () => BrowserWindow | null;
}

export function registerIpcHandlers(deps: IpcDeps): void {
  const { store, getWindow } = deps;

  ipcMain.handle("gmb:version", () => process.env.npm_package_version ?? "0.1.0");

  ipcMain.handle("gmb:data-dir", () => store.getPath());

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

  ipcMain.handle("gmb:dir:scan-audio", async (_e, dir: string) => {
    return scanAudioDir(dir, 0);
  });

  ipcMain.handle("gmb:audio:meta", async (_e, p: string) => {
    try {
      const stat = fs.statSync(p);
      return { duration: undefined, bytes: stat.size };
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