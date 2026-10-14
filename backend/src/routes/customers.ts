import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role, PriceTier } from "@prisma/client";
import { ah } from "../lib/http.js";

export const customersRouter = Router();
customersRouter.use(requireAuth);

customersRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { nama: "asc" },
    });
    res.json(rows);
  })
);

const schema = z.object({
  nama: z.string().min(1),
  telp: z.string().optional().nullable(),
  alamat: z.string().optional().nullable(),
  tipeHarga: z.nativeEnum(PriceTier).default(PriceTier.umum),
});

customersRouter.post(
  "/",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const row = await prisma.customer.create({ data });
    res.status(201).json(row);
  })
);

customersRouter.put(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const row = await prisma.customer.update({ where: { id: Number(req.params.id) }, data });
    res.json(row);
  })
);

customersRouter.delete(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    await prisma.customer.update({
      where: { id: Number(req.params.id) },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  })
);
