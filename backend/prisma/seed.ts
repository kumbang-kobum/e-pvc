import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

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

async function main() {
  // Settings (idempotent)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: {}, // jangan timpa nilai yang sudah diubah user
      create: { key, value },
    });
  }
  console.log(`✔ Settings ter-seed (${Object.keys(DEFAULT_SETTINGS).length} entri)`);

  // Admin user (idempotent)
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
    console.log(`• User admin sudah ada, dilewati`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
