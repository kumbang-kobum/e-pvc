import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { ah } from "../lib/http.js";

export const suppliersRouter = Router();
suppliersRouter.use(requireAuth);

suppliersRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.supplier.findMany({
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
});

suppliersRouter.post(
  "/",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const row = await prisma.supplier.create({ data });
    res.status(201).json(row);
  })
);

suppliersRouter.put(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = schema.parse(req.body);
    const row = await prisma.supplier.update({ where: { id: Number(req.params.id) }, data });
    res.json(row);
  })
);

suppliersRouter.delete(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    await prisma.supplier.update({
      where: { id: Number(req.params.id) },
      data: { deletedAt: new Date() },
    });
    res.json({ ok: true });
  })
);
