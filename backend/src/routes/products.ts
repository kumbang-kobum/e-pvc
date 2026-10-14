import { Router } from "express";
import { z } from "zod";
import { Prisma, PriceTier, Role } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const productsRouter = Router();
productsRouter.use(requireAuth);

const unitSchema = z.object({
  namaSatuan: z.string().min(1),
  faktorKeBase: z.coerce.number().positive(),
});

const productSchema = z.object({
  sku: z.string().min(1),
  barcode: z.string().optional().nullable(),
  nama: z.string().min(1),
  categoryId: z.coerce.number().int().optional().nullable(),
  baseUnit: z.string().min(1),
  hargaAplikator: z.coerce.number().min(0).default(0),
  hargaReseller: z.coerce.number().min(0).default(0),
  hargaUmum: z.coerce.number().min(0).default(0),
  stokMinimum: z.coerce.number().min(0).default(0),
  units: z.array(unitSchema).min(1),
});

// Pastikan baseUnit ada di daftar units dengan faktor 1, dan nama satuan unik.
function validateUnits(baseUnit: string, units: z.infer<typeof unitSchema>[]) {
  const names = units.map((u) => u.namaSatuan.toLowerCase());
  if (new Set(names).size !== names.length) throw new ApiError(400, "Nama satuan tidak boleh dobel");
  const base = units.find((u) => u.namaSatuan.toLowerCase() === baseUnit.toLowerCase());
  if (!base) throw new ApiError(400, `Satuan dasar "${baseUnit}" harus ada di daftar satuan`);
  if (Number(base.faktorKeBase) !== 1)
    throw new ApiError(400, `Satuan dasar "${baseUnit}" harus berfaktor 1`);
}

// Stok terkini per produk = jumlah qty_sisa dari semua batch.
async function stockMap(productIds: number[]): Promise<Record<number, number>> {
  if (productIds.length === 0) return {};
  const grouped = await prisma.stockBatch.groupBy({
    by: ["productId"],
    where: { productId: { in: productIds } },
    _sum: { qtySisaBase: true },
  });
  const map: Record<number, number> = {};
  for (const g of grouped) map[g.productId] = Number(g._sum.qtySisaBase ?? 0);
  return map;
}

productsRouter.get(
  "/",
  ah(async (req, res) => {
    const q = (req.query.q as string | undefined)?.trim();
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        ...(q
          ? { OR: [{ nama: { contains: q } }, { sku: { contains: q } }, { barcode: { contains: q } }] }
          : {}),
      },
      include: { category: true, units: true },
      orderBy: { nama: "asc" },
    });
    const stok = await stockMap(products.map((p) => p.id));
    res.json(products.map((p) => ({ ...p, stok: stok[p.id] ?? 0 })));
  })
);

productsRouter.get(
  "/:id",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const p = await prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { category: true, units: true },
    });
    if (!p) throw new ApiError(404, "Produk tidak ditemukan");
    const stok = await stockMap([id]);
    res.json({ ...p, stok: stok[id] ?? 0 });
  })
);

productsRouter.post(
  "/",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = productSchema.parse(req.body);
    validateUnits(data.baseUnit, data.units);

    const dupe = await prisma.product.findUnique({ where: { sku: data.sku } });
    if (dupe) throw new ApiError(400, `SKU "${data.sku}" sudah dipakai`);

    const product = await prisma.product.create({
      data: {
        sku: data.sku,
        barcode: data.barcode || null,
        nama: data.nama,
        categoryId: data.categoryId ?? null,
        baseUnit: data.baseUnit,
        hargaAplikator: data.hargaAplikator,
        hargaReseller: data.hargaReseller,
        hargaUmum: data.hargaUmum,
        stokMinimum: data.stokMinimum,
        units: { create: data.units.map((u) => ({ namaSatuan: u.namaSatuan, faktorKeBase: u.faktorKeBase })) },
      },
      include: { units: true, category: true },
    });
    res.status(201).json({ ...product, stok: 0 });
  })
);

productsRouter.put(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const data = productSchema.parse(req.body);
    validateUnits(data.baseUnit, data.units);

    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new ApiError(404, "Produk tidak ditemukan");

    // Catat perubahan harga jual ke price_history.
    const tiers: { tier: PriceTier; old: Prisma.Decimal; next: number }[] = [
      { tier: PriceTier.aplikator, old: existing.hargaAplikator, next: data.hargaAplikator },
      { tier: PriceTier.reseller, old: existing.hargaReseller, next: data.hargaReseller },
      { tier: PriceTier.umum, old: existing.hargaUmum, next: data.hargaUmum },
    ];
    const priceLogs = tiers
      .filter((t) => !t.old.equals(new Prisma.Decimal(t.next)))
      .map((t) => ({
        productId: id,
        tier: t.tier,
        hargaLama: t.old,
        hargaBaru: new Prisma.Decimal(t.next),
        userId: req.user!.id,
      }));

    const product = await prisma.$transaction(async (tx) => {
      await tx.productUnit.deleteMany({ where: { productId: id } });
      const p = await tx.product.update({
        where: { id },
        data: {
          sku: data.sku,
          barcode: data.barcode || null,
          nama: data.nama,
          categoryId: data.categoryId ?? null,
          baseUnit: data.baseUnit,
          hargaAplikator: data.hargaAplikator,
          hargaReseller: data.hargaReseller,
          hargaUmum: data.hargaUmum,
          stokMinimum: data.stokMinimum,
          units: { create: data.units.map((u) => ({ namaSatuan: u.namaSatuan, faktorKeBase: u.faktorKeBase })) },
        },
        include: { units: true, category: true },
      });
      if (priceLogs.length) await tx.priceHistory.createMany({ data: priceLogs });
      return p;
    });

    const stok = await stockMap([id]);
    res.json({ ...product, stok: stok[id] ?? 0 });
  })
);

productsRouter.delete(
  "/:id",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const stok = await stockMap([id]);
    if ((stok[id] ?? 0) > 0) throw new ApiError(400, "Produk masih punya stok, tidak bisa dihapus");
    await prisma.product.update({ where: { id }, data: { deletedAt: new Date(), aktif: false } });
    res.json({ ok: true });
  })
);
