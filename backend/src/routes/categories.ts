import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { ah, ApiError } from "../lib/http.js";

export const categoriesRouter = Router();
categoriesRouter.use(requireAuth);

categoriesRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: { nama: "asc" },
    });
    res.json(rows);
  })
);

const schema = z.object({ nama: z.string().min(1) });

categoriesRouter.post(
  "/",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const { nama } = schema.parse(req.body);
    const row = await prisma.category.create({ data: { nama } });
    res.status(201).json(row);
  })
);

categoriesRouter.put(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const { nama } = schema.parse(req.body);
    const id = Number(req.params.id);
    const row = await prisma.category.update({ where: { id }, data: { nama } });
    res.json(row);
  })
);

categoriesRouter.delete(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const count = await prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (count > 0) throw new ApiError(400, `Kategori dipakai ${count} produk, tidak bisa dihapus`);
    await prisma.category.update({ where: { id }, data: { deletedAt: new Date() } });
    res.json({ ok: true });
  })
);
