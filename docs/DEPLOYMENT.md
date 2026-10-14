# Panduan Deployment — n2N / E-pvc (Windows)

Dokumen ini menjelaskan cara membangun installer `.exe` dan memasang aplikasi di komputer toko (Windows, single-PC).

---

## 1. Prasyarat di PC build
- **Node.js 20+** (untuk membangun; tidak wajib ada di PC toko karena Electron membawa Node sendiri).
- **MariaDB** (lihat opsi di §4).
- Git (opsional).

> Rekomendasi: **lakukan build langsung di Windows** agar engine Prisma & Electron cocok dengan target. Build dari macOS bisa, tapi lebih rawan (schema sudah menyertakan `binaryTargets = ["native","windows"]` untuk membantu).

## 2. Langkah build installer
Dari root proyek:

```bash
# Backend
cd backend
npm install
# set koneksi DB di .env (lihat §3), lalu:
npx prisma migrate deploy      # buat skema di database produksi
npm run seed                   # settings toko + admin (admin/admin123)
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

Installer ada di `desktop/release/`. Jalankan `.exe` untuk memasang (bisa pilih folder, buat shortcut desktop).

## 3. Konfigurasi koneksi database
Aplikasi membaca koneksi dari file **`config.json`** di folder data user:
`C:\Users\<nama>\AppData\Roaming\n2N E-pvc\config.json`

Dibuat otomatis saat pertama dijalankan, isi default:
```json
{
  "DATABASE_URL": "mysql://root:%40Alnaira1729@localhost:3306/n2n-pvc",
  "JWT_SECRET": "ganti-secret-ini-di-produksi"
}
```
Edit sesuai kredensial MariaDB di PC toko. **Karakter spesial pada password harus di-URL-encode** (contoh `@` → `%40`). Ganti juga `JWT_SECRET` dengan string acak.

> Saat development, backend memakai `backend/.env` (bukan `config.json`).

## 4. MariaDB di PC toko — dua opsi

### Opsi A (disarankan untuk v1): pasang MariaDB sebagai layanan
1. Unduh MariaDB untuk Windows (MSI) dari mariadb.org, pasang sebagai service (otomatis start).
2. Buat database & (opsional) user:
   ```sql
   CREATE DATABASE `n2n-pvc` CHARACTER SET utf8mb4;
   ```
3. Sesuaikan `config.json` (§3).
4. Skema dibuat saat build (`prisma migrate deploy`) — atau jalankan sekali di PC toko bila DB-nya baru.

### Opsi B (lanjutan): bundel MariaDB portable
Agar benar-benar "pasang sekali, langsung jalan" tanpa instalasi MariaDB terpisah:
1. Taruh MariaDB portable di `vendor/mariadb/` (berisi `bin/`, `data/`, dll).
2. Tambahkan ke `desktop/package.json` → `build.extraResources`:
   ```json
   { "from": "../vendor/mariadb", "to": "mariadb" }
   ```
3. Aplikasi otomatis mengenali `resources/mariadb/bin` untuk backup (`MARIADB_BIN`).
4. **Perlu kode tambahan** untuk start/stop proses `mysqld` dari Electron saat app buka/tutup (placeholder sudah ada di `desktop/main.js`). Uji di Windows.

## 5. Cara kerja saat dijalankan (produksi)
1. Electron menjalankan backend (`backend/dist/server.js`) memakai Node bawaan Electron.
2. Backend konek MariaDB, menyajikan UI + API di `http://localhost:3100`.
3. Electron menunggu `/api/health` OK lalu memuat UI.
4. Backup otomatis harian tersimpan di `AppData\Roaming\n2N E-pvc\backups`.

## 6. Setelah instalasi
- Login awal: **admin / admin123** → segera ganti password.
- Menu **Pengguna**: tambah akun kasir.
- Menu **Pengaturan**: ubah nama toko, alamat, format nota, ukuran kertas, dan kelola **Backup**.
- Isi **Produk** & **Pembelian** untuk mengisi stok, lalu transaksi di **Kasir**.

## 7. Backup & restore
- Otomatis: tiap hari (default jam 23). Atur via env `BACKUP_HOUR`, retensi `BACKUP_KEEP` (default 14 file).
- Manual: menu **Pengaturan → Backup Database → Backup Sekarang**.
- Restore: pilih file backup → **Pulihkan** (menimpa data saat ini), lalu muat ulang aplikasi.
