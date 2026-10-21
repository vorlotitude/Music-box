import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  protocol,
  net,
  nativeImage,
  globalShortcut,
  type MenuItemConstructorOptions,
} from "electron";
import path from "node:path";
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { JsonStore } from "../store/JsonStore";
import { GsiServer } from "../gsi/GsiServer";
import { ProcessMonitor } from "../game/processMonitor";
import { LcuClient } from "../game/LcuClient";
import { registerIpcHandlers, appendFileLog } from "../ipc";

const DEV_URL = process.env.GMB_DEV_URL || "http://localhost:5173";
const IS_DEV = process.env.GMB_DEV === "1" || !app.isPackaged;

// Electron's Chromium sandbox fails to bootstrap (crash 0x80000003) when the
// unpacked exe lives on a secondary drive / is unsigned — common when a user
// "installs" the app on another volume. This is a local-trust companion app
// (loads only local content + the user's own audio), so disable the sandbox
// up front instead of crashing mid-launch. Must be set before app is ready.
app.commandLine.appendSwitch("no-sandbox");

// Single-instance: a second launch focuses the existing window instead of
// starting a duplicate GSI listener / audio engine (Phase 2 §11).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let storeRef: JsonStore | null = null;

// Live OS-facing state reflected into the tray menu (§2/§7).
let reactPaused = false;
let gameRunning = false;

function getWindow() {
  return mainWindow;
}

function storePath() {
  return path.join(app.getPath("userData"), "game-music-box.json");
}

function readSettings(store: JsonStore): Record<string, unknown> {
  try {
    return (store.get("settings", "main") as Record<string, unknown>) ?? {};
  } catch {
    return {};
  }
}

/** Show + focus the main window (restoring it from the tray / minimized). */
function showWindow(win: BrowserWindow): void {
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Toggle visibility from a global shortcut (Ctrl+Shift+M). */
function toggleWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    showWindow(win);
  }
}

function sendCommand(win: BrowserWindow | null, cmd: { kind: string; to?: string }): void {
  if (win && !win.isDestroyed()) win.webContents.send("gmb:command", cmd);
}

function createWindow(store: JsonStore): BrowserWindow {
  const settings = readSettings(store);
  const launchMinimized = settings.launchMinimized === true;
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    show: !launchMinimized,
    title: "Game Music Box",
    backgroundColor: "#0a0a0c",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (!launchMinimized) win.once("ready-to-show", () => win.show());

  if (process.env.GMB_DEV === "1") {
    win.loadURL(process.env.GMB_DEV_URL || DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  // Diagnostics: surface renderer console into the file log for debugging
  // audio routing (sink resolution / setSinkId) issues.
  win.webContents.on(
    "console-message",
    (_e: unknown, _level: unknown, message: unknown) => {
      appendFileLog({ ts: Date.now(), kind: "renderer", message: `[R] ${String(message)}` });
    },
  );

  win.on("close", (e) => {
    // If minimize-to-tray is enabled, hide instead of quitting.
    const minimizeToTray = readSettings(store).minimizeToTray !== false;
    if (minimizeToTray && !(app as any).isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

function createTrayIcon() {
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUElEQVR42mNkwAL+g4HpGAsDA4MAiJ3yGNbU0uJAiInBTQcBEx9swjggkH9xnABkHL4ZKJxwsMSokBCyhtEVF0GyEwPLR/jFClgyMoI5QNEWABg5HBL78j3nAAAAAElFTkSuQmCC",
  );
  return img;
}

/** Rebuild the tray context menu from current live state + persisted boxes. */
function refreshTray(): void {
  const win = mainWindow;
  const store = storeRef;
  if (!win || !store || !tray) return;
  let boxes: { id: string; name: string; enabled?: boolean }[] = [];
  try {
    boxes = (store.all("boxes") as { id: string; name: string; enabled?: boolean }[]) ?? [];
  } catch {
    boxes = [];
  }
  const enabledBoxes = boxes.filter((b) => b.enabled !== false);

  const template: MenuItemConstructorOptions[] = [
    { label: "Open Game Music Box", click: () => showWindow(win) },
    { type: "separator" },
    {
      label: reactPaused ? "Resume Reaction" : "Pause Reaction",
      click: () => sendCommand(win, { kind: "toggle-reaction" }),
    },
    {
      label: "Current Game",
      submenu: [{ label: gameRunning ? "CS2 · Connected" : "CS2 · Not running", enabled: false }],
    },
    {
      label: "Music Box",
      submenu: enabledBoxes.length
        ? enabledBoxes.map((b) => ({
            label: b.name,
            click: () => {
              showWindow(win);
              sendCommand(win, { kind: "navigate", to: `/rules?box=${b.id}` });
            },
          }))
        : [{ label: "None enabled", enabled: false }],
    },
    { label: "Settings", click: () => { showWindow(win); sendCommand(win, { kind: "navigate", to: "/settings" }); } },
    { type: "separator" },
    { label: "Quit", click: () => { (app as any).isQuitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

function createTray(win: BrowserWindow): Tray {
  tray = new Tray(createTrayIcon());
  tray.setToolTip("Game Music Box");
  refreshTray();
  tray.on("double-click", () => showWindow(win));
  return tray;
}

/** Startup-folder shortcut path for dev builds (no registry writes needed). */
function startupShortcutPath(): string {
  return path.join(
    app.getPath("appData"),
    "Microsoft",
    "Windows",
    "Start Menu",
    "Programs",
    "Startup",
    "Game Music Box.lnk",
  );
}

/** Create a Startup-folder shortcut pointing at the dev electron.exe + app path. */
function createStartupShortcut(): void {
  const target = process.execPath;
  const appPath = app.getAppPath();
  const lnk = startupShortcutPath();
  const q = (s: string) => s.replace(/'/g, "''");
  const script =
    `$ws = New-Object -ComObject WScript.Shell; ` +
    `$sc = $ws.CreateShortcut('${q(lnk)}'); ` +
    `$sc.TargetPath = '${q(target)}'; ` +
    `$sc.Arguments = '"${q(appPath)}"'; ` +
    `$sc.WorkingDirectory = '${q(appPath)}'; ` +
    `$sc.Save()`;
  execFileSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], {
    stdio: "ignore",
  });
}

/** Apply the "Start with Windows" login item live from persisted settings. */
function applyLoginItem(store: JsonStore): void {
  try {
    const on = readSettings(store).startWithWindows === true;
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: on, path: process.execPath });
    } else {
      // Dev builds run the bare electron.exe. setLoginItemSettings writes a
      // registry value without quoting, so any space in the path (e.g.
      // "TRAE SOLO CN") breaks boot-up — Windows splits the argument and
      // Electron falls back to its default "path-to-app" welcome screen.
      // A Startup-folder shortcut quotes arguments reliably and needs no
      // registry writes at all.
      const lnk = startupShortcutPath();
      if (on) {
        createStartupShortcut();
      } else {
        fs.rmSync(lnk, { force: true });
      }
    }
  } catch {
    /* login-item unavailable (e.g. portable env); non-fatal */
  }
}

/** Register global reaction/view hotkeys (opt-in via settings.shortcutsEnabled). */
function applyShortcuts(store: JsonStore): void {
  globalShortcut.unregisterAll();
  try {
    if (readSettings(store).shortcutsEnabled === false) return;
    globalShortcut.register("CommandOrControl+Shift+M", () => toggleWindow());
    globalShortcut.register("CommandOrControl+Shift+P", () =>
      sendCommand(mainWindow, { kind: "toggle-reaction" }),
    );
  } catch {
    /* hotkey registration may fail on locked sessions; non-fatal */
  }
}

// Mutable service refs created once in whenReady (Phase 3 background service).
let gsi: GsiServer | null = null;
let monitor: ProcessMonitor | null = null;
let lcu: LcuClient | null = null;
let monitoringStarted = false;

function startMonitoring(): void {
  if (monitoringStarted || !storeRef) return;
  monitoringStarted = true;
  const port =
    Number(process.env.GMB_GSI_PORT ?? (storeRef.get("settings", "main") as any)?.gsiPort ?? 3001);
  gsi = new GsiServer(port, {
    onPayload: (body: Record<string, unknown>) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gmb:raw-payload", body);
      }
    },
    onFirstContact: () => log("GSI: first contact from CS2"),
    onError: (err: Error) => log(`GSI: ${err.message}`),
  });
  gsi.start().catch((err: Error) => log(`GSI failed to start on ${port}: ${err.message}`));

  monitor = new ProcessMonitor(
    ["cs2.exe"],
    (running: boolean) => {
      gameRunning = running;
      refreshTray();
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("gmb:game-running", running);
    },
    (err: Error) => log(`ProcessMonitor: ${err.message}`),
  );
  monitor.start(5000);

  lcu = new LcuClient({
    onSnapshot: (snap) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("gmb:lcu-payload", snap);
    },
    onRunningChange: (running) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("gmb:lcu-running", running);
    },
    onError: (err: Error) => log(`LCU: ${err.message}`),
  });
  lcu.start(3000);
}

function stopMonitoring(): void {
  if (!monitoringStarted) return;
  monitoringStarted = false;
  try { monitor?.stop(); } catch { /* noop */ }
  try { gsi?.stop(); } catch { /* noop */ }
  try { lcu?.stop(); } catch { /* noop */ }
  monitor = null; gsi = null; lcu = null;
}

/** Honor the "Start monitoring games" setting live (settings save / launch). */
function applyMonitoring(store: JsonStore): void {
  const on = readSettings(store).startMonitoringGames !== false;
  if (on) startMonitoring();
  else stopMonitoring();
}

// Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "appmedia",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

app.setAppUserModelId("com.game.musicbox");

app.whenReady().then(async () => {
  protocol.handle("appmedia", async (req) => {
    try {
      const url = new URL(req.url);
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ""));
      // Renderer `fetch(appmedia://…)` is a cross-origin request — the file
      // response must carry ACAO, otherwise the renderer can't read the bytes
      // (video → audio extraction silently failed with no CORS header).
      const res = await net.fetch(pathToFileURL(filePath).toString());
      const headers = new Headers(res.headers);
      headers.set("Access-Control-Allow-Origin", "*");
      return new Response(res.body, { status: res.status, headers });
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });

  const store = new JsonStore({ filePath: storePath(), logger: log });
  storeRef = store;

  // Phase 2: keep the process alive in the system tray (background-resident).
  app.on("window-all-closed", () => {});

  // A second launch focuses the running instance (single-instance §11).
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showWindow(mainWindow);
    }
  });

  applyLoginItem(store);

  mainWindow = createWindow(store);
  createTray(mainWindow);

  registerIpcHandlers({
    store,
    getWindow,
    // Re-apply OS-facing behavior whenever settings change (startup, hotkeys,
    // monitoring). NO registry/Defender/SAC/security-policy writes happen here.
    onSettingsChanged: () => {
      applyLoginItem(storeRef!);
      applyShortcuts(storeRef!);
      applyMonitoring(storeRef!);
      refreshTray();
    },
    setReactPaused: (paused: boolean) => {
      reactPaused = paused;
      refreshTray();
    },
  });

  applyShortcuts(store);
  applyMonitoring(store);

  app.on("activate", () => {
    if (storeRef && BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow(storeRef);
    else if (mainWindow && !mainWindow.isDestroyed()) showWindow(mainWindow);
  });
});

app.on("before-quit", () => {
  (app as any).isQuitting = true;
  stopMonitoring();
  globalShortcut.unregisterAll();
});

function log(msg: string) {
  appendFileLog({ ts: Date.now(), kind: "native", message: msg });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gmb:log", { ts: Date.now(), msg });
  }
  console.log(msg);
}

export { log, getWindow };