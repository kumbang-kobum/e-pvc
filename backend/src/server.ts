import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { authRouter } from "./routes/auth.js";
import { settingsRouter } from "./routes/settings.js";
import { categoriesRouter } from "./routes/categories.js";
import { suppliersRouter } from "./routes/suppliers.js";
import { customersRouter } from "./routes/customers.js";
import { productsRouter } from "./routes/products.js";
import { purchasesRouter } from "./routes/purchases.js";
import { salesRouter } from "./routes/sales.js";
import { shiftsRouter } from "./routes/shifts.js";
import { usersRouter } from "./routes/users.js";
import { expensesRouter } from "./routes/expenses.js";
import { opnameRouter } from "./routes/opname.js";
import { returnsRouter } from "./routes/returns.js";
import { reportsRouter } from "./routes/reports.js";
import { backupRouter } from "./routes/backup.js";
import { startBackupScheduler } from "./lib/backup.js";
import { ApiError } from "./lib/http.js";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "connected" });
  } catch {
    res.status(503).json({ status: "error", db: "disconnected" });
  }
});

app.use("/api/auth", authRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/suppliers", suppliersRouter);
app.use("/api/customers", customersRouter);
app.use("/api/products", productsRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/sales", salesRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/users", usersRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/opname", opnameRouter);
app.use("/api/returns", returnsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/backup", backupRouter);

// Produksi: sajikan hasil build frontend (SPA) jika FRONTEND_DIST di-set & ada.
const frontendDist = process.env.FRONTEND_DIST;
if (frontendDist && fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
  console.log(`✔ Menyajikan frontend dari ${frontendDist}`);
}

// Error handler terpusat
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  if (err instanceof ZodError) {
    return res.status(400).json({ error: "Data tidak valid", detail: err.issues });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return res.status(400).json({ error: "Data duplikat (unik)" });
    if (err.code === "P2025") return res.status(404).json({ error: "Data tidak ditemukan" });
  }
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan server" });
});

app.listen(config.port, () => {
  console.log(`✔ Backend E-pvc berjalan di http://localhost:${config.port}`);
  startBackupScheduler();
});
