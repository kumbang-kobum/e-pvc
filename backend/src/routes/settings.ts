import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";

export const settingsRouter = Router();

// Semua user boleh membaca pengaturan (nama toko tampil di nota, header, dll)
settingsRouter.get("/", requireAuth, async (_req, res) => {
  const rows = await prisma.setting.findMany();
  const obj: Record<string, string> = {};
  for (const r of rows) obj[r.key] = r.value;
  res.json(obj);
});

const updateSchema = z.record(z.string(), z.string());

// Hanya admin boleh mengubah pengaturan toko
settingsRouter.put("/", requireAuth, requireRole(Role.admin), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Format pengaturan tidak valid" });

  const entries = Object.entries(parsed.data);
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({ where: { key }, update: { value }, create: { key, value } })
    )
  );
  res.json({ ok: true, updated: entries.length });
});
