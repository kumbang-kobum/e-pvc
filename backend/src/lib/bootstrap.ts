import { spawnSync } from "node:child_process";
import path from "node:path";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../prisma.js";

// Bootstrap produksi: dijalankan backend saat start di PC toko (NODE_ENV=production),
// agar database baru langsung terbentuk tanpa perintah manual — cukup buka aplikasinya.

/**
 * Terapkan migrasi Prisma (`migrate deploy`) memakai CLI prisma yang ikut terbundel
 * di node_modules. Membuat database `n2n-pvc` + seluruh tabel bila belum ada;
 * no-op cepat bila skema sudah terbaru. Idempoten.
 */
export function applyMigrations(): void {
  const backendRoot = path.resolve(__dirname, "..", ".."); // dist/lib → root backend
  const prismaCli = path.join(backendRoot, "node_modules", "prisma", "build", "index.js");
  const schemaPath = path.join(backendRoot, "prisma", "schema.prisma");

  console.log("• Menerapkan migrasi database (prisma migrate deploy)...");
  const r = spawnSync(process.execPath, [prismaCli, "migrate", "deploy", "--schema", schemaPath], {
    cwd: backendRoot,
    stdio: "inherit",
    env: process.env,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error("prisma migrate deploy gagal — pastikan MariaDB berjalan dan DATABASE_URL benar");
  }
}

// Pengaturan awal toko. Semua bisa diubah lewat menu Pengaturan nantinya.
const DEFAULT_SETTINGS: Record<string, string> = {
  nama_toko: "n2N (E-pvc)",
  alamat: "",
  telp: "",
  logo_path: "",
  footer_nota: "Terima kasih telah berbelanja",
  format_no_nota: "INV/{YYYY}/{MM}/{SEQ}", // SEQ = nomor urut 4 digit
  ukuran_kertas: "thermal80", // thermal58 | thermal80 | a4 | a5
  metode_costing: "fifo",
  mata_uang: "IDR",
  ppn_aktif: "false",
  ppn_persen: "0",
};

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "admin123"; // WAJIB diganti setelah login pertama

/** Isi settings default + user admin bila belum ada. Idempoten, tidak menimpa data user. */
export async function seedDefaults(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {}, // jangan timpa nilai yang sudah diubah user
      create: { key, value },
    });
  }
  console.log(`✔ Settings ter-seed (${Object.keys(DEFAULT_SETTINGS).length} entri)`);

  const existing = await prisma.user.findUnique({ where: { username: ADMIN_USERNAME } });
  if (!existing) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await prisma.user.create({
      data: {
        nama: "Administrator",
        username: ADMIN_USERNAME,
        passwordHash,
        role: Role.admin,
      },
    });
    console.log(`✔ User admin dibuat → username: "${ADMIN_USERNAME}", password: "${ADMIN_PASSWORD}" (SEGERA GANTI)`);
  } else {
    console.log("• User admin sudah ada, dilewati");
  }
}
