# Panduan Deployment — n2N / E-pvc (Windows, 1 laptop server + client)

Aplikasi didesain **single-laptop**: satu laptop/PC toko menjadi **server** (MariaDB + backend)
sekaligus **client** (aplikasi kasir Electron). Tidak butuh jaringan, internet, atau PC lain.

Dokumen ini terdiri dari dua bagian:

- **Bagian A** — membangun installer `.exe` (dilakukan developer, sekali per rilis).
- **Bagian B** — memasang di laptop toko (dilakukan siapa saja, tanpa pengetahuan teknis).

---

## Bagian A — Build installer `.exe` (PC developer)

### A.1 Prasyarat
- **Windows** — **wajib**, bukan sekadar saran: backend produksi menjalankan migrasi Prisma
  otomatis saat start, dan engine Prisma yang terbundel di `node_modules` mengikuti OS tempat
  `npm install` dijalankan. Build di macOS/Linux menghasilkan engine yang salah untuk PC toko.
- **Node.js 20+**.
- Tidak perlu MariaDB di PC build (migrasi terjadi nanti di laptop toko, bukan saat build).

### A.2 Langkah build

Dari root proyek:

```bash
# Backend
cd backend
npm install
npx prisma generate            # generate Prisma Client (engine Windows)
npm run build                  # kompilasi ke dist/

# Frontend
cd ../frontend
npm install
npm run build                  # hasil di frontend/dist

# Desktop (installer)
cd ../desktop
npm install
npm run dist                   # hasil: desktop/release/n2N E-pvc Setup x.y.z.exe
```

Installer ada di `desktop/release/`. Distribusikan file `.exe` ini (flashdisk / GitHub Releases).

> Tidak perlu `prisma migrate deploy` atau `npm run seed` saat build — aplikasi ter-install
> membuat database, tabel, dan user admin **sendiri** saat pertama dijalankan di laptop toko.

---

## Bagian B — Instalasi di laptop toko (pengguna akhir)

Hanya 2 instalasi: **MariaDB** (sekali) dan **aplikasi** (sekali). Setelah itu pengguna cukup
klik ikon aplikasi di Desktop.

### B.1 Pasang MariaDB (sekali)

1. Unduh **MariaDB Server MSI** untuk Windows dari <https://mariadb.org/download/>.
2. Jalankan installer. Saat wizard:
   - Isi **password root** → **catat password ini**.
   - Biarkan tercentang **Install as service** (nama service `MariaDB`) — dengan ini MariaDB
     **otomatis hidup setiap laptop dinyalakan**, tanpa perlu diaktifkan manual.
   - Port biarkan default **3306**.
3. Selesai. Tidak perlu membuat database atau menjalankan perintah apa pun —
   aplikasi yang akan membuatnya.

### B.2 Pasang aplikasi

1. Jalankan **`n2N E-pvc Setup x.y.z.exe`** → ikuti wizard (bisa pilih folder).
2. Shortcut **n2N E-pvc** muncul di Desktop.

### B.3 Jalankan pertama kali

1. **Klik ikon n2N E-pvc.** Muncul petunjuk "Pengaturan pertama", lalu file
   `config.json` **terbuka otomatis di Notepad**:

   ```json
   {
     "DATABASE_URL": "mysql://root:PASSWORD_ANDA@localhost:3306/n2n-pvc",
     "JWT_SECRET": "(sudah terisi acak otomatis — biarkan)"
   }
   ```

2. Ganti tulisan `PASSWORD_ANDA` dengan **password root MariaDB** (dari langkah B.1).
   **Karakter spesial harus di-URL-encode** (contoh `@` → `%40`, `#` → `%23`).
   Simpan (Ctrl+S), tutup Notepad.
3. **Buka lagi aplikasinya.** Backend otomatis **membuat database `n2n-pvc` + seluruh tabel
   + user admin** (±10–60 detik, hanya run pertama) lalu layar login tampil.
4. Login **admin / admin123** → **segera ganti password** (menu Pengguna).

> Lokasi file bila perlu diedit lagi: `C:\Users\<nama>\AppData\Roaming\n2N E-pvc\config.json`
> (`JWT_SECRET` dibuat acak per instalasi secara otomatis — tidak perlu diubah.)

### B.4 Pemakaian harian

- Nyalakan laptop → MariaDB hidup sendiri (service) → **klik ikon n2N E-pvc** → kerja.
- Tidak ada yang perlu diaktifkan/dijalankan manual.
- Menu **Pengguna**: tambah akun kasir. Menu **Pengaturan**: nama toko, format nota,
  ukuran kertas, backup.
- Isi **Produk** & **Pembelian** untuk mengisi stok, lalu transaksi di **Kasir**.

### B.5 Troubleshooting

| Gejala | Penyebab & solusi |
|---|---|
| Kotak pesan "Tidak bisa terhubung ke database" | MariaDB tidak jalan → buka **Services** (Win+R → `services.msc`), cari **MariaDB**, klik **Start** dan set **Startup type: Automatic**. Atau password salah → edit `config.json` (lihat B.3). |
| Lupa lokasi config | `Win+R` → ketik `%AppData%\n2N E-pvc` → Enter. |
| Aplikasi putih/kosong lama | Run pertama membuat seluruh tabel — tunggu hingga ±60 detik. |
| Pindah laptop / instal ulang | Pasang MariaDB + aplikasi seperti biasa, lalu **Pengaturan → Backup → Pulihkan** dari file backup lama. |

---

## Cara kerja saat dijalankan (teknis)

1. Electron membaca `config.json` (dibuat otomatis bila belum ada) dan menjalankan backend
   (`backend/dist/server.js`) memakai Node bawaan Electron.
2. Backend (mode produksi) menjalankan **`prisma migrate deploy`** — membuat database & tabel
   bila belum ada, no-op bila sudah terbaru — lalu **seed** (settings + admin, idempoten).
3. Backend menyajikan UI + API di `http://localhost:3100`.
4. Electron menunggu `/api/health` OK (maks. 60 detik) lalu memuat UI.
5. Backup otomatis harian tersimpan di `%AppData%\n2N E-pvc\backups`.

## Backup & restore

- **Otomatis**: tiap hari (default jam 23). Atur via env `BACKUP_HOUR`, retensi `BACKUP_KEEP`
  (default 14 file).
- **Manual**: menu **Pengaturan → Backup Database → Backup Sekarang**.
- **Restore**: pilih file backup → **Pulihkan** (menimpa data saat ini), lalu muat ulang aplikasi.
- Simpan salinan backup secara berkala ke flashdisk/cloud — laptop toko bisa rusak/hilang.

## Lanjutan: bundel MariaDB portable (opsional, belum untuk v1)

Agar benar-benar "pasang sekali, langsung jalan" tanpa instalasi MariaDB terpisah:

1. Taruh MariaDB portable di `vendor/mariadb/` (berisi `bin/`, `data/`, dll).
2. Tambahkan ke `desktop/package.json` → `build.extraResources`:
   ```json
   { "from": "../vendor/mariadb", "to": "mariadb" }
   ```
3. Aplikasi otomatis mengenali `resources/mariadb/bin` untuk backup (`MARIADB_BIN`).
4. **Perlu kode tambahan** untuk start/stop proses `mysqld` dari Electron saat app buka/tutup
   (placeholder sudah ada di `desktop/main.js`). Uji di Windows.
