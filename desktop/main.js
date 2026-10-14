const { app, BrowserWindow, dialog } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const { spawn } = require("child_process");

const isDev = !!process.env.ELECTRON_DEV;
const PORT = process.env.PORT || 3100;
const BASE_URL = `http://localhost:${PORT}`;

let backendProc = null;

/** Lokasi config DB di folder data user (bisa diedit admin tanpa rebuild). */
function loadDbConfig() {
  const cfgPath = path.join(app.getPath("userData"), "config.json");
  const fallback = {
    DATABASE_URL: "mysql://root:%40Alnaira1729@localhost:3306/n2n-pvc",
    JWT_SECRET: "ganti-secret-ini-di-produksi",
  };
  try {
    if (fs.existsSync(cfgPath)) return { ...fallback, ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) };
    fs.writeFileSync(cfgPath, JSON.stringify(fallback, null, 2)); // tulis default pertama kali
  } catch (e) {
    console.error("Gagal baca config.json:", e);
  }
  return fallback;
}

/** Jalankan backend (produksi) memakai Node bawaan Electron. */
function startBackend() {
  const resources = process.resourcesPath;
  const backendEntry = path.join(resources, "backend", "dist", "server.js");
  const frontendDist = path.join(resources, "frontend", "dist");
  const mariadbBin = path.join(resources, "mariadb", "bin"); // opsional (bila MariaDB di-bundle)

  const cfg = loadDbConfig();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    NODE_ENV: "production",
    PORT: String(PORT),
    FRONTEND_DIST: frontendDist,
    BACKUP_DIR: path.join(app.getPath("userData"), "backups"),
    DATABASE_URL: cfg.DATABASE_URL,
    JWT_SECRET: cfg.JWT_SECRET,
  };
  if (fs.existsSync(mariadbBin)) env.MARIADB_BIN = mariadbBin;

  backendProc = spawn(process.execPath, [backendEntry], { env, stdio: "inherit" });
  backendProc.on("error", (e) => dialog.showErrorBox("Backend gagal dijalankan", String(e)));
}

/** Tunggu backend siap (polling health) lalu muat UI. */
function waitForBackend(win, tries = 0) {
  http
    .get(`${BASE_URL}/api/health`, (res) => {
      if (res.statusCode === 200) win.loadURL(BASE_URL);
      else retry(win, tries);
    })
    .on("error", () => retry(win, tries));
}
function retry(win, tries) {
  if (tries > 60) {
    dialog.showErrorBox("Timeout", "Backend tidak merespons. Pastikan MariaDB berjalan.");
    return;
  }
  setTimeout(() => waitForBackend(win, tries + 1), 500);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    title: "n2N — E-pvc",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173"); // dev: Vite dev server
    win.webContents.openDevTools();
  } else {
    startBackend();
    waitForBackend(win);
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
  if (backendProc) backendProc.kill();
});
