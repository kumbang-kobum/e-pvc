import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Role } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole(Role.admin));

const safe = { id: true, nama: true, username: true, role: true, aktif: true, createdAt: true } as const;

usersRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.user.findMany({
      where: { deletedAt: null },
      select: safe,
      orderBy: { nama: "asc" },
    });
    res.json(rows);
  })
);

const createSchema = z.object({
  nama: z.string().min(1),
  username: z.string().min(3),
  password: z.string().min(6),
  role: z.nativeEnum(Role).default(Role.kasir),
});

usersRouter.post(
  "/",
  ah(async (req, res) => {
    const data = createSchema.parse(req.body);
    const dupe = await prisma.user.findUnique({ where: { username: data.username } });
    if (dupe) throw new ApiError(400, `Username "${data.username}" sudah dipakai`);
    const passwordHash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: { nama: data.nama, username: data.username, passwordHash, role: data.role },
      select: safe,
    });
    res.status(201).json(user);
  })
);

const updateSchema = z.object({
  nama: z.string().min(1),
  role: z.nativeEnum(Role),
  aktif: z.boolean(),
});

usersRouter.put(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const data = updateSchema.parse(req.body);

    // Jangan sampai admin terakhir dinonaktifkan / diturunkan.
    if (data.role !== Role.admin || !data.aktif) {
      const target = await prisma.user.findUnique({ where: { id } });
      if (target?.role === Role.admin) {
        const admins = await prisma.user.count({ where: { role: Role.admin, aktif: true, deletedAt: null } });
        if (admins <= 1) throw new ApiError(400, "Tidak boleh menonaktifkan/menurunkan admin terakhir");
      }
    }

    const user = await prisma.user.update({ where: { id }, data, select: safe });
    res.json(user);
  })
);

const pwSchema = z.object({ password: z.string().min(6) });

usersRouter.post(
  "/:id/reset-password",
  ah(async (req, res) => {
    const { password } = pwSchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.update({ where: { id: Number(req.params.id) }, data: { passwordHash } });
    res.json({ ok: true });
  })
);

usersRouter.delete(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    if (id === req.user!.id) throw new ApiError(400, "Tidak bisa menghapus akun sendiri");
    const target = await prisma.user.findUnique({ where: { id } });
    if (target?.role === Role.admin) {
      const admins = await prisma.user.count({ where: { role: Role.admin, aktif: true, deletedAt: null } });
      if (admins <= 1) throw new ApiError(400, "Tidak boleh menghapus admin terakhir");
    }
    await prisma.user.update({ where: { id }, data: { deletedAt: new Date(), aktif: false } });
    res.json({ ok: true });
  })
);
