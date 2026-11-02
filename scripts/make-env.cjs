// Dipanggil start-windows.bat saat backend/.env belum ada.
// Kredensial dibaca dari env DB_USER / DB_PASS (di-set oleh skrip .bat),
// password otomatis di-URL-encode, JWT_SECRET dibuat acak.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const user = process.env.DB_USER || "root";
const pass = process.env.DB_PASS || "";
const url = `mysql://${user}:${encodeURIComponent(pass)}@localhost:3306/n2n-pvc`;

const content = [
  `DATABASE_URL="${url}"`,
  ``,
  `JWT_SECRET="${crypto.randomBytes(32).toString("hex")}"`,
  `JWT_EXPIRES_IN="12h"`,
  ``,
  `PORT=3100`,
  ``,
].join("\n");

fs.writeFileSync(path.join(__dirname, "..", "backend", ".env"), content);
console.log("backend/.env dibuat (password ter-URL-encode, JWT_SECRET acak).");
