import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  shell,
  protocol,
  net,
  nativeImage,
  screen,
} from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JsonStore } from "../store/JsonStore";
import { GsiServer } from "../gsi/GsiServer";
import { ProcessMonitor } from "../game/processMonitor";
import { registerIpcHandlers } from "../ipc";

const DEV_URL = process.env.GMB_DEV_URL || "http://localhost:5173";
const IS_DEV = process.env.GMB_DEV === "1" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

function getWindow() {
  return mainWindow;
}

function storePath() {
  return path.join(app.getPath("userData"), "game-music-box.json");
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1080,
    minHeight: 680,
    show: false,
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

  win.once("ready-to-show", () => win.show());

  if (process.env.GMB_DEV === "1") {
    win.loadURL(process.env.GMB_DEV_URL || DEV_URL);
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "../../renderer/index.html"));
  }

  win.on("close", (e) => {
    // If we're in tray mode, hide instead of quitting.
    if (process.env.GMB_TRAY === "1" && !(app as any).isQuitting) {
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

function createTray(win: BrowserWindow): Tray {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("Game Music Box");
  const menu = Menu.buildFromTemplate([
    { label: "Open Game Music Box", click: () => win.show() },
    { label: "🎧 Dev Mode (open)", click: () => win.show() },
    { type: "separator" },
    { label: "Quit", click: () => { (app as any).isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => win.show());
  return tray;
}

function createTrayIcon() {
  // A simple 16x16 accent dot is enough for the tray MVP.
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUElEQVR42mNkwAL+g4HpGAsDA4MAiJ3yGNbU0uJAiInBTQcBEx9swjggkH9xnABkHL4ZKJxwsMSokBCyhtEVF0GyEwPLR/jFClgyMoI5QNEWABg5HBL78j3nAAAAAElFTkSuQmCC",
  );
  return img;
}

// Must be registered before app is ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: "appmedia",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

app.setAppUserModelId("com.game.musicbox");

let gsi: GsiServer | null = null;
let monitor: ProcessMonitor | null = null;

app.whenReady().then(async () => {
  protocol.handle("appmedia", (req) => {
    try {
      const url = new URL(req.url);
      const filePath = decodeURIComponent(url.pathname.replace(/^\//, ""));
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });

  const store = new JsonStore({ filePath: storePath(), logger: log });

  mainWindow = createWindow();
  createTray(mainWindow);

  registerIpcHandlers({ store, getWindow });

  // Start GSI listener (default port 3001).
  const port = Number(process.env.GMB_GSI_PORT ?? (store.get("settings", "main") as any)?.gsiPort ?? 3001);
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

  // CS2 process monitor (throttled).
  monitor = new ProcessMonitor(
    ["cs2.exe"],
    (running: boolean, name?: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("gmb:game-running", running);
      }
    },
    (err: Error) => log(`ProcessMonitor: ${err.message}`),
  );
  monitor.start(5000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    else mainWindow?.show();
  });
});

app.on("before-quit", () => {
  (app as any).isQuitting = true;
  monitor?.stop();
  gsi?.stop();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function log(msg: string) {
  // Mirror to renderer when available.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("gmb:log", { ts: Date.now(), msg });
  }
  console.log(msg);
}

export { log, getWindow };