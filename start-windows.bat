@echo off
setlocal
title n2N E-pvc
cd /d "%~dp0"

echo ==================================================
echo  n2N E-pvc
echo  Skrip ini mengurus semuanya: install, database,
echo  lalu menjalankan aplikasi. Cukup double-click.
echo  Syarat: Node.js 20+ dan MariaDB sudah berjalan.
echo ==================================================
echo.

:: ---------- Cek Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node.js tidak ditemukan.
    echo Pasang Node.js 20+ dari https://nodejs.org lalu jalankan ulang.
    pause
    exit /b 1
)

:: ---------- Install dependensi (hanya jika belum ada) ----------
if exist "backend\node_modules" goto :backend_deps_ok
echo [setup] Install dependensi backend (sekali saja)...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 goto :gagal_npm
cd /d "%~dp0"
:backend_deps_ok

if exist "frontend\node_modules" goto :frontend_deps_ok
echo [setup] Install dependensi frontend (sekali saja)...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 goto :gagal_npm
cd /d "%~dp0"
:frontend_deps_ok

:: ---------- Buat backend\.env (hanya run pertama) ----------
if exist "backend\.env" goto :env_ok
echo.
echo [setup] Konfigurasi koneksi MariaDB (hanya sekali):
set "DB_USER="
set /p DB_USER=  User MariaDB [Enter = root]:
if "%DB_USER%"=="" set "DB_USER=root"
set "DB_PASS="
set /p DB_PASS=  Password MariaDB (boleh kosong):
node scripts\make-env.cjs
if errorlevel 1 (
    echo [ERROR] Gagal membuat backend\.env
    pause
    exit /b 1
)
:env_ok

:: ---------- Skema database + data awal (idempoten, aman diulang) ----------
cd /d "%~dp0backend"
echo.
echo [db] Menyiapkan Prisma Client...
call npx prisma generate
if errorlevel 1 goto :gagal_db

echo [db] Menyiapkan skema database...
call npx prisma migrate deploy
if errorlevel 1 goto :gagal_db

echo [db] Memastikan data awal (settings + admin)...
call npm run seed
if errorlevel 1 goto :gagal_db
cd /d "%~dp0"

:: ---------- Jalankan backend + frontend ----------
echo.
echo [run] Membuka backend  (http://localhost:3100)...
start "n2N E-pvc - Backend" cmd /k "cd /d %~dp0backend && npm run dev"

echo [run] Membuka frontend (http://localhost:5173)...
start "n2N E-pvc - Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

:: ---------- Tunggu backend siap, lalu buka browser ----------
echo [run] Menunggu server siap...
set /a tries=0
:wait_backend
set /a tries+=1
curl -s -f -o NUL http://localhost:3100/api/health && goto :backend_ok
if %tries% geq 30 goto :backend_timeout
timeout /t 1 /nobreak >nul
goto :wait_backend

:backend_timeout
echo [PERINGATAN] Backend belum merespons setelah 30 detik.
echo Cek jendela "n2N E-pvc - Backend" untuk pesan error, browser tetap dibuka.

:backend_ok
start http://localhost:5173
echo.
echo ==================================================
echo  Aplikasi berjalan: http://localhost:5173
echo  Login awal: admin / admin123 (segera ganti)
echo  Untuk berhenti: tutup jendela Backend dan Frontend.
echo ==================================================
timeout /t 5 >nul
exit /b 0

:: ---------- Penanganan error ----------
:gagal_npm
echo.
echo [ERROR] npm install gagal. Periksa koneksi internet lalu jalankan ulang.
pause
exit /b 1

:gagal_db
echo.
echo [ERROR] Gagal menyiapkan database. Periksa:
echo  - MariaDB berjalan di localhost:3306
echo  - User/password benar (hapus backend\.env untuk mengisi ulang)
echo  - User punya hak membuat database; bila tidak, buat manual:
echo      CREATE DATABASE `n2n-pvc` CHARACTER SET utf8mb4;
pause
exit /b 1
