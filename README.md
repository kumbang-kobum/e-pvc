# n2N — E-pvc

![Status](https://img.shields.io/badge/status-pra--v1-orange)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-InnoDB-003545?logo=mariadb&logoColor=white)

Aplikasi **Point of Sale (POS) + inventori** untuk toko penjualan **plafon PVC & rangka baja**.
Berjalan sebagai aplikasi **desktop Windows** (web app dibungkus Electron) dengan database **MariaDB**.
Didesain **single-laptop**: satu laptop menjadi server (database + backend) sekaligus client (aplikasi kasir).

Dibuat untuk operasional toko sehari-hari: penjualan di kasir, pencatatan stok akurat (FIFO),
harga jual bertingkat, dan laporan laba.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Teknologi](#teknologi)
- [Struktur](#struktur)
- [Instalasi produksi (PC/laptop toko)](#instalasi-produksi-pclaptop-toko)
- [Menjalankan (development)](#menjalankan-development)
- [Konfigurasi](#konfigurasi)
- [Build installer Windows (.exe)](#build-installer-windows-exe)
- [Skrip Berguna](#skrip-berguna)
- [Dokumentasi](#dokumentasi)
- [Status](#status)

---

## Fitur Utama

- **Kasir (POS)** — cari produk (nama/SKU/barcode), pilih satuan & tier harga, bayar **cash/transfer**, **DP/piutang**, kembalian otomatis.
- **Nota cetak** — thermal **58/80mm** & **A4**, cetak ulang, header toko bisa diubah.
- **Stok akurat (FIFO)** — pembelian membentuk *batch* bermodal sendiri; stok terpotong otomatis per penjualan; HPP & laba terhitung tepat meski **harga beli berubah-ubah**.
- **Satuan fleksibel** — konversi otomatis **dus ↔ pcs** (mis. 1 dus = 15 pcs); rangka baja per batang.
- **Harga 3 tingkat** — aplikator, reseller, umum (+ histori perubahan harga).
- **Pembelian & supplier**, **customer** (dengan tipe harga default).
- **Retur** jual (stok balik ke batch asal) & beli (ke supplier).
- **Stok opname** dengan penyesuaian FIFO + alert stok minimum.
- **Pengeluaran** harian & bulanan.
- **Shift kasir** buka/tutup (rekap cash vs transfer, deteksi selisih).
- **Void** nota (stok & pembayaran dikembalikan, tercatat).
- **Laporan** penjualan, **laba-rugi**, **grafik 10 barang terlaris**, nilai persediaan, **piutang** + pelunasan.
- **Pengguna** — 2 peran: **admin** & **kasir** (hak akses berbeda).
- **Backup/restore** database — otomatis harian + manual.

## Teknologi

| Lapisan | Teknologi |
|---|---|
| Frontend | React + Vite + TailwindCSS |
| Backend | Node.js + Express + TypeScript |
| ORM/DB | Prisma → **MariaDB** (InnoDB, `utf8mb4`) |
| Desktop | Electron + electron-builder (installer NSIS) |

Prinsip inti: semua uang `DECIMAL`, transaksi penjualan **atomik** dengan *row-lock* FIFO, dan ledger stok sebagai sumber kebenaran.

## Struktur

```
backend/    API (Express + TypeScript + Prisma + MariaDB)
frontend/   UI (React + Vite + TailwindCSS)
desktop/    Pembungkus desktop (Electron + electron-builder)
scripts/    Skrip bantu (pembuat .env untuk start-windows.bat)
docs/       PRD & panduan deployment
```

## Instalasi produksi (PC/laptop toko)

Untuk pengguna akhir — **tanpa Node.js, tanpa command prompt**. Satu laptop jadi server + client:

1. **Pasang MariaDB** (sekali) — installer MSI dari [mariadb.org](https://mariadb.org/download/),
   centang *Install as service* agar otomatis hidup tiap laptop dinyalakan. Catat password root.
2. **Jalankan `n2N E-pvc Setup x.y.z.exe`** → ikuti wizard → shortcut muncul di Desktop.
3. **Buka aplikasinya.** Run pertama: `config.json` terbuka otomatis di Notepad —
   ganti `PASSWORD_ANDA` dengan password root MariaDB (sekali saja), simpan, tutup.
4. **Buka lagi aplikasinya.** Backend otomatis **membuat database `n2n-pvc` + seluruh
   tabel** (migrasi Prisma) + **user admin** + pengaturan awal toko.
5. Login **admin / admin123** → ganti password → siap dipakai.

Selanjutnya **cukup klik ikon aplikasi** — selama MariaDB berjalan (service), semuanya otomatis.

> **Salah password / layar putih?** Hapus `config.json` di `%AppData%\n2N E-pvc`
> (build lama: `%AppData%\e-pvc-desktop`) → buka aplikasi → isi password lewat Notepad
> yang terbuka otomatis → buka lagi → tunggu ±60 detik. Rinci: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §B.5.

Panduan lengkap + troubleshooting: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Menjalankan (development)

**Prasyarat:** Node.js 20+, dan MariaDB berjalan di `localhost:3306`.

### Cara cepat di Windows — satu klik

Cukup **double-click `start-windows.bat`** (selama MariaDB berjalan). Skrip ini otomatis:

1. Install dependensi backend & frontend (hanya saat belum ada).
2. Run pertama: tanya user & password MariaDB → `backend\.env` dibuat otomatis
   (password di-URL-encode, `JWT_SECRET` acak — tanpa edit file manual).
3. Generate Prisma Client, buat database `n2n-pvc` + skema (`prisma migrate deploy`),
   dan data awal (settings toko + user admin) — idempoten, aman diulang tiap start.
4. Jalankan backend & frontend di 2 jendela, tunggu server siap, lalu buka
   browser ke http://localhost:5173.

Run berikutnya tinggal double-click lagi — tidak ada yang perlu diaktifkan.
Salah isi password? Hapus `backend\.env` lalu jalankan ulang skripnya.

> **Autostart saat PC nyala (opsional):** tekan `Win+R`, ketik `shell:startup`,
> lalu taruh shortcut `start-windows.bat` di folder tersebut.

### Cara manual (semua OS)

```sql
CREATE DATABASE `n2n-pvc` CHARACTER SET utf8mb4;
```

Butuh 2 terminal (desktop/Electron opsional):

**1 — Backend**
```bash
cd backend
npm install
cp .env.example .env          # lalu isi DATABASE_URL (lihat Konfigurasi)
npx prisma generate           # generate Prisma Client
npx prisma migrate dev        # buat skema (sekali di awal)
npm run seed                  # settings toko + user admin
npm run dev                   # http://localhost:3100
```

**2 — Frontend**
```bash
cd frontend
npm install
npm run dev                   # http://localhost:5173 (proxy /api → :3100)
```

**3 — Desktop (opsional)**
```bash
cd desktop
npm install
npm run dev                   # Electron memuat http://localhost:5173
```

Di browser cukup buka **http://localhost:5173**. Backend & frontend harus jalan dulu sebelum Electron.

### Login awal
> Username **`admin`** · Password **`admin123`** — **wajib diganti** setelah login pertama. Tambah akun kasir lewat menu **Pengguna**.

## Konfigurasi

- **Development:** backend membaca `backend/.env` (lihat [`backend/.env.example`](backend/.env.example)).
  Dibuat otomatis oleh `start-windows.bat` saat run pertama.
- **Produksi (terpasang):** aplikasi membaca `config.json` di `%AppData%\n2N E-pvc\`
  (`C:\Users\<nama>\AppData\Roaming\n2N E-pvc\config.json`) — dibuat otomatis saat pertama jalan.
  Bila gagal konek, **dialog error menampilkan path config yang benar** (build lama memakai
  `%AppData%\e-pvc-desktop\`). Troubleshooting lengkap: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) §B.5.

Password MariaDB dengan karakter spesial **harus di-URL-encode** di `DATABASE_URL` (mis. `@` → `%40`):

```
DATABASE_URL="mysql://root:%40Passwordku@localhost:3306/n2n-pvc"
```

## Build installer Windows (.exe)

> **Wajib build di Windows.** Backend produksi menjalankan migrasi Prisma otomatis saat start,
> dan engine Prisma yang terbundel mengikuti OS tempat `npm install` dijalankan.

```bash
cd backend  && npm install && npx prisma generate && npm run build
cd ../frontend && npm install && npm run build
cd ../desktop  && npm install && npm run dist      # → desktop/release/*.exe
```

Tidak perlu `migrate deploy`/`seed` saat build — **aplikasi ter-install membuat database,
skema, dan user admin sendiri saat pertama dijalankan** di PC toko.

Langkah lengkap, opsi MariaDB, dan konfigurasi runtime ada di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> Installer `.exe` tidak disertakan di repo (di-`.gitignore`). Distribusikan lewat **GitHub Releases**.

## Skrip Berguna

| Lokasi | Perintah | Fungsi |
|---|---|---|
| (root) | `start-windows.bat` | **Dev all-in-one**: install + setup DB + jalankan backend & frontend |
| backend | `npm run dev` | Jalankan API (hot-reload) |
| backend | `npm run seed` | Seed settings + admin (idempoten) |
| backend | `npm run reset` | **Reset DB** (drop + migrasi + seed) — hapus semua data |
| backend | `npm run build` | Kompilasi ke `dist/` |
| frontend | `npm run build` | Build UI ke `dist/` |
| desktop | `npm run dist` | Build installer Windows |

## Dokumentasi

- [PRD — rancangan & keputusan desain](docs/PRD.md)
- [Panduan Deployment Windows](docs/DEPLOYMENT.md)

## Status

Semua fungsi inti **selesai & teruji** (Fase 0–5). Menjelang rilis **v1**, build & uji `.exe` dilakukan di Windows.
Backend kini **otomatis migrasi + seed saat start produksi** — PC toko tidak butuh perintah manual.
