# PRD — Aplikasi Penjualan Plafon PVC & Rangka Baja

> Status: Draft v2 · Tanggal: 2026-10-14 · Database: **MariaDB**

## 1. Ringkasan Produk

Aplikasi Point of Sale (POS) + inventori untuk toko penjualan plafon PVC dan rangka baja.
Berjalan sebagai **aplikasi desktop Windows** (web app yang dibungkus jadi `.exe` installer),
dengan data tersimpan di **MariaDB**. Mendukung multi-user (admin & kasir), pencatatan stok
akurat (stok terpotong otomatis saat penjualan), harga jual bertingkat, penanganan harga modal
yang berubah-ubah, serta konversi satuan dus ↔ pcs.

### Tujuan
- Penjualan cepat & akurat di kasir, dengan nota tercetak untuk customer.
- Stok real-time, tidak pernah "bocor" (setiap penjualan memotong stok).
- Laba kotor terukur per transaksi (karena modal dilacak per batch pembelian).
- Laporan penjualan, pengeluaran, dan barang terlaris untuk pengambilan keputusan.

---

## 2. Pengguna & Hak Akses (Role)

| Fitur | Admin | Kasir |
|---|---|---|
| Transaksi penjualan + cetak nota | ✅ | ✅ |
| Lihat harga jual | ✅ | ✅ |
| Lihat harga modal / laba | ✅ | ❌ |
| Input pembelian / stok masuk | ✅ | ❌ (opsional) |
| Stok opname | ✅ | ❌ |
| Kelola produk, harga, supplier, customer | ✅ | ❌ |
| Pengeluaran harian/bulanan | ✅ | sebagian (kas harian) |
| Laporan & grafik | ✅ | terbatas (penjualan sendiri/shift) |
| Pengaturan toko & user | ✅ | ❌ |
| Tutup kasir / rekap shift | ✅ | ✅ (shift sendiri) |

> Catatan: password disimpan **hash** (bcrypt/argon2), tidak plain text. Ada **audit log** untuk aksi sensitif (ubah harga, hapus transaksi, stok opname).

---

## 3. Fitur Inti (dari requirement)

1. **Stok opname** — hitung fisik vs sistem, catat selisih, buat penyesuaian stok (adjustment) + alasan.
2. **Pembukuan penjualan** — semua transaksi tercatat, bisa difilter per tanggal/kasir/metode bayar.
3. **Cara bayar: cash & transfer** — pilih metode saat checkout; transfer bisa catat bank/tujuan & bukti.
4. **Input pembelian (stok masuk)** — input modal + 3 tingkat harga jual; harga beli berubah ditangani dengan **costing berbasis batch/FIFO** (lihat §6).
5. **2 role: admin & kasir** (lihat §2).
6. **Pengeluaran harian & bulanan** — kategori pengeluaran, rekap per hari & per bulan.
7. **Stok terpotong saat penjualan** — dijamin via transaksi DB atomik + ledger stok (lihat §7).
8. **Laporan penjualan** — omzet, jumlah transaksi, laba kotor, per periode/kasir/kategori.
9. **Grafik 10 barang terlaris** — berdasarkan qty / nilai, filter periode.
10. **Desktop Windows (.exe)** — web app dibungkus desktop (lihat §9 tech stack).
11. **Rekomendasi tambahan** — lihat §4.
12. **Nota penjualan cetak** — thermal 58/80mm atau A4, header nama toko.
13. **Nama toko bisa diubah** + **konversi satuan dus ↔ pcs** (lihat §5 & §6).

---

## 4. Rekomendasi Tambahan (jawaban poin 11 — "apa yang masih kurang")

Fitur berikut hampir pasti dibutuhkan toko bangunan tapi belum disebut:

1. **Data Customer** — khususnya aplikator & reseller (nama, HP, alamat, tipe harga default). Memudahkan pilih tier harga otomatis + riwayat pembelian.
2. **Data Supplier** — sumber barang, untuk pembelian & laporan hutang.
3. **Retur penjualan & retur pembelian** — barang rusak/salah; stok & uang harus ikut terkoreksi.
4. **Hutang / Piutang (kredit & tempo)** — penjualan tidak selalu lunas (DP, bon, tempo). Perlu status: Lunas / DP / Belum bayar + jatuh tempo. Sama untuk hutang ke supplier.
5. **Diskon & (opsional) PPN** — diskon per item / per nota; pajak jika nanti jadi PKP.
6. **Backup & Restore database** — WAJIB karena data lokal. Backup otomatis harian (file `.sql`) + restore manual. Mencegah kehilangan data saat Windows/hard disk bermasalah.
7. **Alert stok minimum** — notifikasi saat stok barang di bawah batas (reorder point).
8. **Barcode / scan** — percepat kasir & input (SKU + barcode per produk). Opsional tapi sangat membantu.
9. **Dashboard** — ringkasan hari ini: omzet, transaksi, kas, stok menipis, barang terlaris.
10. **Nomor nota otomatis** — format `INV/2026/10/0001`, tidak boleh dobel (unik per transaksi).
11. **Shift kasir / tutup kas** — saldo awal, penjualan cash, pengeluaran, saldo akhir; selisih kas terdeteksi.
12. **Laporan Laba/Rugi** — karena modal dilacak, bisa tampilkan laba kotor & bersih (omzet − HPP − pengeluaran).
13. **Pengaturan toko** — nama, alamat, telepon, logo, footer nota, format nomor nota, ukuran kertas printer.
14. **Harga jual bertingkat + histori harga** — simpan histori perubahan harga jual untuk audit.
15. **Satuan fleksibel** — produk bisa punya >1 satuan jual (pcs, dus, dan bila perlu batang/lonjor/lembar).
16. **Reprint nota** — cetak ulang nota lama (duplikat) tanpa mengubah stok/transaksi.
17. **Laporan nilai persediaan** — total nilai stok (dari sisa batch × modal) per tanggal.

> Catatan: **multi-terminal LAN tidak masuk** (deployment dikunci Single PC, lihat §12). Bila kelak toko butuh >1 PC, arsitekturnya sudah siap tinggal pindahkan MariaDB ke PC server.

---

## 5. Model Satuan & Konversi (jawaban poin 13)

Masalah: 1 dus PVC berisi **15 pcs** (baik yang 4m maupun 6m). Jual 1 dus = stok berkurang 15 pcs;
input beli 1 dus = stok bertambah 15 pcs.

**Aturan desain:**
- Setiap produk punya **satuan dasar (base unit)**, yaitu satuan terkecil tempat stok disimpan → untuk PVC = **pcs**.
- Produk punya daftar **satuan + faktor konversi** ke base unit:
  - `pcs` → faktor 1
  - `dus` → faktor 15
- **Stok selalu disimpan dalam base unit (pcs).** Dus hanya tampilan/pilihan saat transaksi.
- Saat jual/beli: user pilih satuan (dus/pcs) + qty → sistem konversi ke base unit:
  `qty_base = qty × faktor_konversi`. Itulah yang menambah/mengurangi stok.
- PVC 4m dan PVC 6m adalah **produk/SKU berbeda** (meski sama-sama 15 pcs/dus), karena harga & panjang beda.

> Contoh: stok 100 pcs. Jual 1 dus (faktor 15) → stok jadi 85 pcs. Tampilan bisa ditulis "5 dus 10 pcs".

**Contoh non-PVC (rangka baja/aksesoris):** model satuan ini generik, jadi produk lain pakai base unit sendiri:
- **Rangka baja (hollow/kanal C) → base unit `batang`, dijual utuh per batang (TIDAK dipotong/eceran per meter).** Faktor `batang` = 1. Bila dibeli per-ikat, tambah satuan `ikat` dengan faktor isinya (mis. 1 ikat = 4 batang) → beli 1 ikat otomatis +4 batang.
- Sekrup/aksesoris → base unit `pcs`, satuan `dus`/`box` dengan faktor sesuai isi.
- Qty disimpan `DECIMAL(15,3)` untuk keamanan format, tapi dalam praktik PVC & rangka baja selalu bilangan bulat (batang/pcs/dus utuh).

---

## 6. Penanganan Harga Modal Berubah-ubah (jawaban poin 4) — **bagian terpenting**

Masalah: hari ini PVC 6m modal Rp100.000/lembar, besok naik Rp105.000, tapi stok lama masih ada.
Kalau modal ditimpa begitu saja, laba jadi salah dan nilai stok kacau.

### Solusi: Costing berbasis **Batch/Layer (FIFO)**

Setiap kali barang masuk (pembelian), buat **satu batch stok** yang menyimpan:
`produk, qty masuk (base unit), qty sisa, harga modal per base unit, tanggal masuk, supplier`.

- Stok total sebuah produk = **jumlah qty sisa dari semua batch**-nya.
- Saat **penjualan**, stok dipotong dari **batch tertua dulu (FIFO)**. HPP (modal) transaksi diambil dari modal batch yang terpakai.
- Kalau satu penjualan melintasi 2 batch (mis. 10 pcs dari batch @100rb + 5 pcs dari batch @105rb), HPP dihitung campuran sesuai porsi.

**Keuntungan:**
- Modal lama & baru hidup berdampingan tanpa saling menimpa.
- Laba per transaksi akurat (harga jual − HPP FIFO).
- Nilai persediaan (inventory value) benar.

**Harga JUAL (3 tingkat)** disimpan di **master produk per satuan dasar (pcs/batang)** — `harga_aplikator`, `harga_reseller`, `harga_umum`. Harga satuan besar dihitung otomatis: `harga_dus = harga_base × faktor`. Contoh: harga umum Rp7.000/pcs → 1 dus = Rp105.000. Perubahan harga jual dicatat di tabel histori.
Jadi: **modal = per batch (FIFO)**, **harga jual = per produk per base unit (current + histori), satuan besar dikali faktor**.

> Alternatif costing: **Weighted Average** (modal dirata-rata tertimbang setiap barang masuk). Lebih sederhana tapi laba per transaksi kurang presisi. **Rekomendasi: FIFO** karena cocok untuk material bangunan dan permintaan "harga lama masih ada".

### Format angka (penting)
- Semua kolom **uang** = `DECIMAL(15,2)` (bukan `INT`/`FLOAT`), karena modal per-pcs dari pembelian per-dus bisa pecahan (mis. Rp100.000 ÷ 15 = Rp6.666,67). `FLOAT` dilarang (galat pembulatan uang).
- Semua kolom **qty** = `DECIMAL(15,3)` agar fleksibel untuk satuan non-bulat.
- Pembulatan tampilan ke Rupiah dilakukan di layer tampilan, bukan di penyimpanan.

### Interaksi FIFO dengan Retur & Stok Opname
- **Retur penjualan** (barang balik dari customer): stok bertambah lagi. Modal dikembalikan **sesuai HPP asal** transaksi itu (ditarik dari `sale_item_costs` nota terkait), bukan harga modal terbaru. Jadi batch yang dulu terpakai "diisi ulang" pada harga modalnya semula → laba terkoreksi benar.
- **Retur pembelian** (barang dikembalikan ke supplier): kurangi `qty_sisa` pada **batch asal** pembelian tersebut. Bila batch sudah sebagian terjual, retur dibatasi maksimal sebesar qty sisa batch.
- **Stok opname — fisik < sistem** (barang hilang/susut): kurangi dari batch **termuda lebih dulu** (agar batch tua tetap tercatat untuk FIFO penjualan normal), catat sebagai `adjust` (−) + alasan.
- **Stok opname — fisik > sistem** (barang lebih): buat **batch penyesuaian** baru dengan modal = modal batch terakhir produk itu (atau rata-rata bila tak ada acuan), catat `adjust` (+).
- Semua di atas tetap menulis `stock_movements` agar jejak audit utuh.

---

## 7. Jaminan Stok Terpotong (jawaban poin 7)

- Semua perubahan stok lewat **ledger `stock_movements`** (in/out/adjustment/retur) — satu sumber kebenaran, bisa diaudit.
- Checkout penjualan dijalankan dalam **1 transaksi DB ( begin → commit/rollback)**: kurangi batch (FIFO) + tulis movement + simpan sale + sale_items. Jika ada error, **rollback** total (tidak ada stok/nota setengah jadi).
- Cegah **stok minus**: validasi qty tersedia sebelum commit; bila kurang, transaksi ditolak.
- Cegah **race condition** (2 kasir jual barang sama bersamaan): kunci baris batch saat pemotongan (`SELECT ... FOR UPDATE`).
- Nomor nota di-generate di dalam transaksi agar unik.
- **Void/pembatalan nota:** nota yang sudah jadi **tidak dihapus fisik** — ditandai `void` (dengan alasan + user + waktu). Saat void, stok dikembalikan **persis ke batch asal** menggunakan rincian `sale_item_costs`, dan ditulis `stock_movements` pembalik. Nota void tidak dihitung di laporan omzet/laba. Koreksi = void lalu buat nota baru (bukan edit diam-diam).

---

## 8. Skema Data (ringkas, MariaDB / InnoDB)

> InnoDB wajib (transaksi + foreign key + row lock). Charset `utf8mb4`.
> Konvensi: uang = `DECIMAL(15,2)`, qty = `DECIMAL(15,3)`, waktu = `DATETIME`. Setiap tabel punya `created_at`/`updated_at`. Penghapusan data master pakai **soft delete** (`aktif`/`deleted_at`), bukan hapus fisik.

- **settings** — `key`, `value` (nama toko, alamat, telp, logo_path, footer_nota, format_no_nota, ukuran_kertas, metode_costing).
- **users** — id, nama, username (unik), password_hash, role (`admin`|`kasir`), aktif.
- **categories** — id, nama.
- **products** — id, sku (unik), barcode, nama, category_id, base_unit, harga_aplikator, harga_reseller, harga_umum (semua **per base unit**), stok_minimum, aktif.
- **product_units** — id, product_id, nama_satuan (`pcs`,`dus`), faktor_ke_base. (base selalu faktor 1)
- **price_history** — id, product_id, tier, harga_lama, harga_baru, user_id, waktu.
- **suppliers** — id, nama, telp, alamat.
- **customers** — id, nama, telp, alamat, tipe_harga (`aplikator`|`reseller`|`umum`).
- **purchases** — id, no_pembelian, supplier_id, tanggal, subtotal, diskon, total, status_bayar (`lunas`|`dp`|`belum`), jatuh_tempo, user_id. *(hutang ke supplier)*
- **purchase_items** — id, purchase_id, product_id, unit, qty_input, qty_base, modal_per_base.
- **stock_batches** — id, product_id, purchase_item_id, qty_awal_base, qty_sisa_base, modal_per_base, tanggal_masuk. *(inti FIFO)*
- **stock_movements** — id, product_id, tipe (`in`|`out`|`adjust`|`retur_in`|`retur_out`), qty_base (+/−), ref_tipe, ref_id, waktu, user_id. *(ledger/audit)*
- **sales** — id, no_nota (unik), customer_id (nullable), tipe_harga, tanggal, subtotal, diskon, ppn (default 0 — fitur off sampai toko jadi PKP), total, status_bayar (`lunas`|`dp`|`belum`), jatuh_tempo (nullable), user_id (kasir), shift_id, is_void, void_alasan, void_by, void_at.
- **sale_items** — id, sale_id, product_id, unit, qty_input, qty_base, harga_jual_per_base, diskon_item, hpp_per_base (hasil FIFO), subtotal.
- **sale_item_costs** — id, sale_item_id, stock_batch_id, qty_base, modal_per_base. *(rincian batch terpakai → laba presisi & dasar pembalikan saat void/retur)*
- **payments** — id, ref_tipe (`sale`|`purchase`), ref_id, tanggal, jumlah, metode_bayar (`cash`|`transfer`), bank/tujuan, keterangan, user_id. *(mendukung DP + pelunasan bertahap; status_bayar nota dihitung dari total vs jumlah pembayaran)*
- **expenses** — id, kategori, keterangan, jumlah, tanggal, tipe (`harian`|`bulanan`), user_id.
- **stock_opname** + **stock_opname_items** — header + (product_id, stok_sistem, stok_fisik, selisih).
- **shifts** — id, user_id, buka, tutup, saldo_awal, total_cash, total_transfer, total_pengeluaran, saldo_akhir_sistem, saldo_akhir_fisik, selisih. *(hanya cash menambah laci kas; transfer dicatat terpisah)*
- **returns** + **return_items** — id, tipe (`jual`|`beli`), ref_sale/purchase_id, tanggal, total, user_id; item merujuk `sale_item`/`purchase_item` + qty_base diretur. *(MVP)*
- **audit_logs** — id, user_id, aksi, entitas, detail, waktu.

---

## 9. Arsitektur & Tech Stack (jawaban poin 10)

Target: web app dibungkus jadi **aplikasi desktop Windows (.exe installer)**, dibuka seperti aplikasi
(webview), DB = MariaDB.

**Rekomendasi stack:**
- **Frontend:** React + Vite + TailwindCSS (UI cepat, cocok POS). Grafik: Recharts/Chart.js.
- **Backend/API:** Node.js (NestJS atau Express) — REST API, logika transaksi & FIFO.
- **ORM:** Prisma atau TypeORM → MariaDB (InnoDB).
- **Desktop wrapper:** **Electron** (paling mulus membungkus web + Node backend jadi `.exe`; installer pakai electron-builder / NSIS). Alternatif ringan: Tauri.
- **Cetak nota:** thermal ESC/POS (58/80mm) atau PDF untuk A4.

**Model deployment (penting — perlu keputusan):**
- **Opsi A — Single PC:** MariaDB + app di 1 komputer (kasir & admin login di PC yang sama). Paling simpel. Installer bundling MariaDB (atau MariaDB portable).
- **Opsi B — Multi-terminal LAN:** 1 PC "server" menjalankan MariaDB + API; PC kasir lain konek via jaringan toko. Perlu bila kasir dan admin di komputer berbeda / lebih dari 1 kasir.

> MariaDB adalah DB server (bukan embedded seperti SQLite), jadi installer harus memasang/menyertakan service MariaDB di PC server. Ini memengaruhi kompleksitas installer — makanya perlu tahu Opsi A vs B di awal.

> **⚠️ Risiko packaging (Single PC):** agar benar-benar "dobel-klik .exe" tanpa pasang MariaDB manual, rekomendasi: **bundel MariaDB portable** (ZIP binaries) di dalam folder aplikasi, lalu aplikasi Electron yang `mysql_install_db` (inisialisasi data dir di `%APPDATA%`) + start/stop proses `mysqld` saat app buka/tutup. Alternatif: installer memasang MariaDB sebagai Windows service (butuh hak admin saat instalasi). Keputusan teknis ini difinalkan di Fase 5; perlu diuji di Windows asli (bukan hanya dev macOS).

---

## 10. Non-Functional Requirements
- **Keamanan:** hash password, role-based access, audit log, session timeout.
- **Keandalan:** transaksi atomik, backup otomatis harian, restore mudah.
- **Performa:** kasir responsif (<200ms per aksi umum), index DB pada kolom pencarian (sku, barcode, nama, tanggal).
- **Bahasa:** UI Bahasa Indonesia, format Rupiah & tanggal lokal.
- **Offline-first:** jalan tanpa internet (LAN lokal saja).

---

## 11. Rencana Pembangunan (Roadmap Bertahap)

**Fase 0 — Fondasi (minggu 1)**
- Setup repo, struktur proyek, koneksi MariaDB, migrasi skema inti, seed user admin.
- Shell desktop (Electron) + login + manajemen user & role.
- Pengaturan toko (nama/alamat/logo/format nota).

**Fase 1 — Master & Pembelian (minggu 2)**
- CRUD kategori, produk (+ satuan & konversi), supplier, customer.
- Input pembelian → buat **stock_batches** + movement (FIFO siap).
- Harga jual 3 tingkat + histori harga.

**Fase 2 — Penjualan & Nota (minggu 3) — jantung aplikasi**
- Layar kasir: cari produk (SKU/barcode/nama), pilih satuan (dus/pcs/batang), tier harga, diskon per item/nota, PPN.
- Checkout cash/transfer + **DP/hutang (piutang)**: pemotongan stok FIFO atomik + HPP per transaksi, pembayaran via tabel `payments`.
- Nomor nota otomatis + **cetak nota** (thermal/A4) + reprint.
- Void nota (pembalikan stok ke batch asal).
- Shift kasir buka/tutup (cash vs transfer).

**Fase 3 — Stok, Retur & Pengeluaran (minggu 4)**
- Stok opname + adjustment (aturan FIFO §6).
- **Retur penjualan & retur pembelian** (koreksi stok + uang sesuai HPP asal).
- Pengeluaran harian & bulanan.
- Alert stok minimum.

**Fase 4 — Laporan & Dashboard (minggu 5)**
- Laporan penjualan (periode/kasir/metode), laba kotor.
- Grafik **10 barang terlaris**.
- Dashboard ringkasan + laporan pengeluaran & laba/rugi.

**Fase 5 — Packaging & Finalisasi (minggu 6)**
- Laporan nilai persediaan + laporan piutang/hutang (aging & jatuh tempo).
- Backup/restore otomatis (`mysqldump` terjadwal).
- **Bundling MariaDB + build installer `.exe`** (electron-builder/NSIS) + uji di Windows (lihat risiko §9).
- Audit log, polish UI, dokumentasi user.

---

## 12. Keputusan yang Sudah Dikunci (2026-10-14)
1. **Deployment: Single PC.** MariaDB + aplikasi + backend berjalan di satu komputer. Installer `.exe` membundel/memasang MariaDB lokal (service `localhost`). Tidak perlu konfigurasi jaringan.
2. **Costing: FIFO** (batch/layer, lihat §6).
3. **Printer nota: Keduanya** — thermal 58/80mm **dan** A4/A5 (PDF). Pilihan default diatur di Pengaturan toko (`ukuran_kertas`), bisa diganti per cetak.
4. **Lingkup MVP: lengkap** — termasuk **Hutang/Piutang (DP & tempo)**, **Retur jual & beli**, **Barcode scanner**, dan **Diskon & PPN**. Keempatnya naik dari "fase lanjutan" menjadi bagian MVP.
5. **Stack: Electron + React (Vite + Tailwind) + Node (NestJS/Express) + Prisma/TypeORM + MariaDB (InnoDB).**
6. **Mata uang: Rupiah (IDR).** Semua kolom uang `DECIMAL(15,2)` (tanpa `FLOAT`); pembulatan hanya di tampilan.
7. **Harga jual: disimpan per satuan dasar (pcs/batang).** Harga satuan besar (dus/ikat) = harga base × faktor konversi, dihitung otomatis — tidak ada harga dus terpisah.
8. **PPN: nonaktif dulu** (toko non-PKP). Kolom & logika PPN disiapkan tapi `ppn = 0`; bisa diaktifkan dari Pengaturan bila kelak jadi PKP.

### Dampak keputusan pada roadmap
- Karena MVP kini mencakup hutang/piutang, retur, barcode, diskon & PPN, fitur-fitur ini **dipindah masuk** ke fase terkait:
  - Diskon & PPN → **Fase 2** (checkout kasir).
  - Barcode → **Fase 1** (field pada produk) + **Fase 2** (scan di kasir).
  - Hutang/Piutang → **Fase 2** (status bayar penjualan) & **Fase 1** (hutang pembelian).
  - Retur jual/beli → **Fase 3**.
- Installer Single PC → tambahkan langkah bundling MariaDB di **Fase 5**.
