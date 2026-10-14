import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";

export const authRouter = Router();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "username & password wajib diisi" });

  const { username, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.aktif || user.deletedAt) {
    return res.status(401).json({ error: "Username atau password salah" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Username atau password salah" });

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  res.json({
    token,
    user: { id: user.id, nama: user.nama, username: user.username, role: user.role },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });
  res.json({ id: user.id, nama: user.nama, username: user.username, role: user.role });
});

const changePwSchema = z.object({
  passwordLama: z.string().min(1),
  passwordBaru: z.string().min(6),
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const parsed = changePwSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Password baru minimal 6 karakter" });

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) return res.status(404).json({ error: "User tidak ditemukan" });

  const ok = await bcrypt.compare(parsed.data.passwordLama, user.passwordHash);
  if (!ok) return res.status(400).json({ error: "Password lama salah" });

  const passwordHash = await bcrypt.hash(parsed.data.passwordBaru, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ ok: true });
});
