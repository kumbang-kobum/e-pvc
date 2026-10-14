import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export interface DbConn {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

/** Parse DATABASE_URL (mysql://user:pass@host:port/db) dengan dekode %-encoding. */
export function parseDbUrl(url: string): DbConn {
  const u = new URL(url);
  return {
    host: u.hostname || "localhost",
    port: u.port || "3306",
    user: decodeURIComponent(u.username) || "root",
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
}

export function backupDir(): string {
  const dir = process.env.BACKUP_DIR || path.resolve(process.cwd(), "backups");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Cari biner dump: MARIADB_BIN (dir) → mariadb-dump → mysqldump.
function dumpCandidates(): string[] {
  const list: string[] = [];
  if (process.env.MARIADB_BIN) {
    list.push(path.join(process.env.MARIADB_BIN, "mariadb-dump"));
    list.push(path.join(process.env.MARIADB_BIN, "mysqldump"));
  }
  list.push("mariadb-dump", "mysqldump");
  return list;
}
function clientBin(): string {
  if (process.env.MARIADB_BIN) return path.join(process.env.MARIADB_BIN, "mariadb");
  return "mariadb";
}

function run(cmd: string, args: string[], conn: DbConn, opts: { outFile?: string; inFile?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { env: { ...process.env, MYSQL_PWD: conn.password } });
    if (opts.outFile) child.stdout.pipe(fs.createWriteStream(opts.outFile));
    if (opts.inFile) fs.createReadStream(opts.inFile).pipe(child.stdin);
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr || `exit ${code}`))));
  });
}

async function tryDump(args: string[], conn: DbConn, outFile: string): Promise<void> {
  let lastErr: unknown;
  for (const bin of dumpCandidates()) {
    try {
      await run(bin, args, conn, { outFile });
      return;
    } catch (e) {
      lastErr = e;
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // error nyata, bukan "binari tak ada"
    }
  }
  throw new Error(`Tidak menemukan mariadb-dump/mysqldump. ${String(lastErr)}`);
}

export async function createBackup(): Promise<{ file: string; size: number }> {
  const conn = parseDbUrl(config.databaseUrl);
  const stamp = new Date().toISOString().replace(/[:T]/g, "-").slice(0, 19);
  const file = path.join(backupDir(), `${conn.database}_${stamp}.sql`);
  const args = ["-h", conn.host, "-P", conn.port, "-u", conn.user, "--single-transaction", "--skip-lock-tables", conn.database];
  await tryDump(args, conn, file);
  const size = fs.statSync(file).size;
  pruneOld();
  return { file: path.basename(file), size };
}

export function listBackups(): { file: string; size: number; waktu: Date }[] {
  return fs
    .readdirSync(backupDir())
    .filter((f) => f.endsWith(".sql"))
    .map((f) => {
      const st = fs.statSync(path.join(backupDir(), f));
      return { file: f, size: st.size, waktu: st.mtime };
    })
    .sort((a, b) => b.waktu.getTime() - a.waktu.getTime());
}

export async function restoreBackup(fileName: string): Promise<void> {
  const safe = path.basename(fileName); // cegah path traversal
  const full = path.join(backupDir(), safe);
  if (!fs.existsSync(full)) throw new Error("File backup tidak ditemukan");
  const conn = parseDbUrl(config.databaseUrl);
  await run(clientBin(), ["-h", conn.host, "-P", conn.port, "-u", conn.user, conn.database], conn, { inFile: full });
}

function pruneOld(keep = Number(process.env.BACKUP_KEEP || 14)) {
  const files = listBackups();
  for (const f of files.slice(keep)) {
    try {
      fs.unlinkSync(path.join(backupDir(), f.file));
    } catch {
      /* abaikan */
    }
  }
}

// Penjadwal backup harian sederhana (cek tiap jam, jalan sekali di jam target).
let lastBackupDay = "";
export function startBackupScheduler() {
  const check = async () => {
    const now = new Date();
    const targetHour = Number(process.env.BACKUP_HOUR || 23);
    const today = now.toISOString().slice(0, 10);
    if (now.getHours() === targetHour && lastBackupDay !== today) {
      lastBackupDay = today;
      try {
        const r = await createBackup();
        console.log(`✔ Backup otomatis: ${r.file}`);
      } catch (e) {
        console.error("Backup otomatis gagal:", e);
      }
    }
  };
  setInterval(check, 60 * 60 * 1000); // tiap jam
}
