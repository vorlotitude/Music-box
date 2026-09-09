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

  // ---- Window controls ----
  ipcMain.handle("gmb:window:minimize", () => getWindow()?.minimize());
  ipcMain.handle("gmb:window:close", () => getWindow()?.close());
}