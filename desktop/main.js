const { app, BrowserWindow, dialog, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");
const { spawn } = require("child_process");

const isDev = !!process.env.ELECTRON_DEV;
const PORT = process.env.PORT || 3100;
const BASE_URL = `http://localhost:${PORT}`;

let backendProc = null;

/** Placeholder yang wajib diganti user saat instalasi — jangan taruh password asli di sini. */
const PASSWORD_PLACEHOLDER = "PASSWORD_ANDA";

/** Lokasi config DB di folder data user (bisa diedit admin tanpa rebuild). */
function loadDbConfig() {
  const cfgPath = path.join(app.getPath("userData"), "config.json");
  const fallback = {
    DATABASE_URL: `mysql://root:${PASSWORD_PLACEHOLDER}@localhost:3306/n2n-pvc`,
    JWT_SECRET: crypto.randomBytes(32).toString("hex"), // acak per instalasi
  };
  try {
    if (fs.existsSync(cfgPath)) return { ...fallback, ...JSON.parse(fs.readFileSync(cfgPath, "utf8")) };
    fs.writeFileSync(cfgPath, JSON.stringify(fallback, null, 2)); // tulis default pertama kali
  } catch (e) {
    console.error("Gagal baca config.json:", e);
  }
  return fallback;
}

/**
 * Run pertama: config.json masih berisi placeholder password.
 * Pandu user mengisinya (buka otomatis di editor) lalu tutup aplikasi.
 * @returns true bila masih placeholder (aplikasi jangan lanjut).
 */
function needsFirstRunConfig() {
  const cfg = loadDbConfig();
  if (!cfg.DATABASE_URL.includes(PASSWORD_PLACEHOLDER)) return false;

  const cfgPath = path.join(app.getPath("userData"), "config.json");
  dialog.showMessageBoxSync({
    type: "info",
    title: "Pengaturan pertama — n2N E-pvc",
    message: "Satu langkah lagi: isi password MariaDB.",
    detail:
      "File pengaturan akan terbuka otomatis setelah ini.\n\n" +
      `1. Pada baris DATABASE_URL, ganti tulisan ${PASSWORD_PLACEHOLDER} dengan password root MariaDB Anda.\n` +
      "   (Karakter spesial harus di-URL-encode, mis. @ menjadi %40)\n" +
      "2. Simpan file (Ctrl+S) lalu tutup.\n" +
      "3. Buka lagi aplikasi n2N E-pvc.\n\n" +
      `Lokasi file: ${cfgPath}`,
  });
  shell.openPath(cfgPath);
  return true;
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
  // 120 × 500ms = 60 detik — run pertama di PC toko perlu waktu ekstra
  // karena backend membuat skema database (migrasi) lebih dulu.
  if (tries > 120) {
    const cfgPath = path.join(app.getPath("userData"), "config.json");
    dialog.showErrorBox(
      "Tidak bisa terhubung ke database",
      "Backend tidak merespons. Periksa:\n\n" +
        "1. MariaDB berjalan (cek Services Windows).\n" +
        `2. User/password MariaDB benar di:\n   ${cfgPath}\n` +
        "   (karakter spesial password harus di-URL-encode, mis. @ menjadi %40)\n\n" +
        "Setelah diperbaiki, tutup lalu buka lagi aplikasi ini."
    );
    return;
  }
  setTimeout(() => waitForBackend(win, tries + 1), 500);
}

function createWindow() {
  // Run pertama produksi: pandu isi password dulu, jangan buka jendela kosong.
  if (!isDev && needsFirstRunConfig()) {
    app.quit();
    return;
  }

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
