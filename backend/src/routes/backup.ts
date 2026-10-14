import { Router } from "express";
import { z } from "zod";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";
import { createBackup, listBackups, restoreBackup } from "../lib/backup.js";

export const backupRouter = Router();
backupRouter.use(requireAuth, requireRole(Role.admin));

backupRouter.get(
  "/",
  ah(async (_req, res) => {
    res.json(listBackups());
  })
);

backupRouter.post(
  "/",
  ah(async (_req, res) => {
    try {
      const r = await createBackup();
      res.status(201).json(r);
    } catch (e) {
      throw new ApiError(500, `Backup gagal: ${(e as Error).message}`);
    }
  })
);

const restoreSchema = z.object({ file: z.string().min(1) });

backupRouter.post(
  "/restore",
  ah(async (req, res) => {
    const { file } = restoreSchema.parse(req.body);
    try {
      await restoreBackup(file);
      res.json({ ok: true });
    } catch (e) {
      throw new ApiError(500, `Restore gagal: ${(e as Error).message}`);
    }
  })
);
