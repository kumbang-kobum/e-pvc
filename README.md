# n2N — E-pvc

![Status](https://img.shields.io/badge/status-pra--v1-orange)
![Platform](https://img.shields.io/badge/platform-Windows-0078D6?logo=windows)
![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![MariaDB](https://img.shields.io/badge/MariaDB-InnoDB-003545?logo=mariadb&logoColor=white)

Aplikasi **Point of Sale (POS) + inventori** untuk toko penjualan **plafon PVC & rangka baja**.
Berjalan sebagai aplikasi **desktop Windows** (web app dibungkus Electron) dengan database **MariaDB**.

Dibuat untuk operasional toko sehari-hari: penjualan di kasir, pencatatan stok akurat (FIFO),
harga jual bertingkat, dan laporan laba.

## Daftar Isi

- [Fitur Utama](#fitur-utama)
- [Teknologi](#teknologi)
- [Struktur](#struktur)
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
docs/       PRD & panduan deployment
```

## Menjalankan (development)

**Prasyarat:** Node.js 20+, dan MariaDB berjalan di `localhost:3306` dengan database `n2n-pvc`.

```sql
CREATE DATABASE `n2n-pvc` CHARACTER SET utf8mb4;
```

Butuh 2 terminal (desktop/Electron opsional):

**1 — Backend**
```bash
cd backend
npm install
cp .env.example .env          # lalu isi DATABASE_URL (lihat Konfigurasi)
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
- **Produksi (terpasang):** aplikasi membaca `config.json` di `%AppData%\n2N E-pvc\`.

Password MariaDB dengan karakter spesial **harus di-URL-encode** di `DATABASE_URL` (mis. `@` → `%40`):

```
DATABASE_URL="mysql://root:%40Passwordku@localhost:3306/n2n-pvc"
```

## Build installer Windows (.exe)

Ringkas (jalankan di Windows untuk hasil paling andal):

```bash
cd backend  && npm install && npx prisma migrate deploy && npm run seed && npm run build
cd ../frontend && npm install && npm run build
cd ../desktop  && npm install && npm run dist      # → desktop/release/*.exe
```

Langkah lengkap, opsi MariaDB, dan konfigurasi runtime ada di [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> Installer `.exe` tidak disertakan di repo (di-`.gitignore`). Distribusikan lewat **GitHub Releases**.

## Skrip Berguna

| Lokasi | Perintah | Fungsi |
|---|---|---|
| backend | `npm run dev` | Jalankan API (hot-reload) |
| backend | `npm run seed` | Seed settings + admin |
| backend | `npm run reset` | **Reset DB** (drop + migrasi + seed) — hapus semua data |
| backend | `npm run build` | Kompilasi ke `dist/` |
| frontend | `npm run build` | Build UI ke `dist/` |
| desktop | `npm run dist` | Build installer Windows |

## Dokumentasi

- [PRD — rancangan & keputusan desain](docs/PRD.md)
- [Panduan Deployment Windows](docs/DEPLOYMENT.md)

## Status

Semua fungsi inti **selesai & teruji** (Fase 0–5). Menjelang rilis **v1**, build & uji `.exe` dilakukan di Windows.
Sebelum rilis, jalankan `npm run reset` di `backend/` untuk membersihkan data contoh pengujian.
