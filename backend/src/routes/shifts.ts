import { Router } from "express";
import { z } from "zod";
import { Prisma, PaymentMethod, RefType } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const shiftsRouter = Router();
shiftsRouter.use(requireAuth);

// Shift terbuka milik kasir saat ini (atau null).
shiftsRouter.get(
  "/current",
  ah(async (req, res) => {
    const shift = await prisma.shift.findFirst({ where: { userId: req.user!.id, tutup: null } });
    res.json(shift);
  })
);

const openSchema = z.object({ saldoAwal: z.coerce.number().min(0).default(0) });

shiftsRouter.post(
  "/open",
  ah(async (req, res) => {
    const { saldoAwal } = openSchema.parse(req.body);
    const existing = await prisma.shift.findFirst({ where: { userId: req.user!.id, tutup: null } });
    if (existing) throw new ApiError(400, "Masih ada shift terbuka. Tutup dulu sebelum buka baru.");
    const shift = await prisma.shift.create({ data: { userId: req.user!.id, saldoAwal } });
    res.status(201).json(shift);
  })
);

const closeSchema = z.object({ saldoAkhirFisik: z.coerce.number().min(0).optional() });

shiftsRouter.post(
  "/close",
  ah(async (req, res) => {
    const body = closeSchema.parse(req.body);
    const shift = await prisma.shift.findFirst({ where: { userId: req.user!.id, tutup: null } });
    if (!shift) throw new ApiError(400, "Tidak ada shift terbuka");

    // Penjualan (non-void) pada shift ini.
    const sales = await prisma.sale.findMany({ where: { shiftId: shift.id, isVoid: false }, select: { id: true } });
    const saleIds = sales.map((s) => s.id);

    const payments = saleIds.length
      ? await prisma.payment.findMany({ where: { refTipe: RefType.sale, refId: { in: saleIds } } })
      : [];
    let totalCash = new Prisma.Decimal(0);
    let totalTransfer = new Prisma.Decimal(0);
    for (const p of payments) {
      if (p.metode === PaymentMethod.cash) totalCash = totalCash.add(p.jumlah);
      else totalTransfer = totalTransfer.add(p.jumlah);
    }

    const expenses = await prisma.expense.findMany({ where: { tanggal: { gte: shift.buka } } });
    const totalPengeluaran = expenses.reduce((s, e) => s.add(e.jumlah), new Prisma.Decimal(0));

    const saldoAkhirSistem = new Prisma.Decimal(shift.saldoAwal).add(totalCash).sub(totalPengeluaran);
    const fisik = body.saldoAkhirFisik !== undefined ? new Prisma.Decimal(body.saldoAkhirFisik) : null;
    const selisih = fisik ? fisik.sub(saldoAkhirSistem) : new Prisma.Decimal(0);

    const updated = await prisma.shift.update({
      where: { id: shift.id },
      data: {
        tutup: new Date(),
        totalCash,
        totalTransfer,
        totalPengeluaran,
        saldoAkhirSistem,
        saldoAkhirFisik: fisik,
        selisih,
      },
    });
    res.json(updated);
  })
);
