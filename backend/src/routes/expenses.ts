import { Router } from "express";
import { z } from "zod";
import { Prisma, ExpenseType } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { ah } from "../lib/http.js";

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

expensesRouter.get(
  "/",
  ah(async (req, res) => {
    const { from, to, tipe } = req.query as { from?: string; to?: string; tipe?: ExpenseType };
    const where: Prisma.ExpenseWhereInput = {};
    if (tipe) where.tipe = tipe;
    if (from || to) {
      where.tanggal = {};
      if (from) (where.tanggal as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.tanggal as Prisma.DateTimeFilter).lte = new Date(to + "T23:59:59");
    }
    const rows = await prisma.expense.findMany({
      where,
      include: { user: { select: { nama: true } } },
      orderBy: { tanggal: "desc" },
      take: 300,
    });
    const total = rows.reduce((s, e) => s.add(e.jumlah), new Prisma.Decimal(0));
    res.json({ rows, total: total.toString() });
  })
);

const schema = z.object({
  kategori: z.string().min(1),
  keterangan: z.string().optional().nullable(),
  jumlah: z.coerce.number().positive(),
  tanggal: z.coerce.date().optional(),
  tipe: z.nativeEnum(ExpenseType).default(ExpenseType.harian),
});

expensesRouter.post(
  "/",
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const row = await prisma.expense.create({
      data: {
        kategori: data.kategori,
        keterangan: data.keterangan ?? null,
        jumlah: data.jumlah,
        tanggal: data.tanggal ?? new Date(),
        tipe: data.tipe,
        userId: req.user!.id,
      },
    });
    res.status(201).json(row);
  })
);

expensesRouter.delete(
  "/:id",
  ah(async (req, res) => {
    await prisma.expense.delete({ where: { id: Number(req.params.id) } });
    res.json({ ok: true });
  })
);
