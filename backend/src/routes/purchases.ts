import { Router } from "express";
import { z } from "zod";
import { Prisma, PriceTier, Role, MovementType, RefType, PaymentStatus } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const purchasesRouter = Router();
purchasesRouter.use(requireAuth);

const itemSchema = z.object({
  productId: z.coerce.number().int(),
  unit: z.string().min(1), // satuan input (dus/pcs/batang)
  qtyInput: z.coerce.number().positive(),
  modalInput: z.coerce.number().min(0), // modal per satuan input (mis. per dus)
  // opsional: perbarui harga jual produk saat barang masuk
  updatePrices: z
    .object({
      hargaAplikator: z.coerce.number().min(0),
      hargaReseller: z.coerce.number().min(0),
      hargaUmum: z.coerce.number().min(0),
    })
    .optional(),
});

const purchaseSchema = z.object({
  supplierId: z.coerce.number().int().optional().nullable(),
  tanggal: z.coerce.date().optional(),
  diskon: z.coerce.number().min(0).default(0),
  statusBayar: z.nativeEnum(PaymentStatus).default(PaymentStatus.lunas),
  jatuhTempo: z.coerce.date().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

async function nextNoPembelian(tx: Prisma.TransactionClient, tgl: Date): Promise<string> {
  const yyyy = tgl.getFullYear();
  const mm = String(tgl.getMonth() + 1).padStart(2, "0");
  const prefix = `PB/${yyyy}/${mm}/`;
  const count = await tx.purchase.count({ where: { noPembelian: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

purchasesRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.purchase.findMany({
      include: { supplier: true, _count: { select: { items: true } } },
      orderBy: { tanggal: "desc" },
      take: 200,
    });
    res.json(rows);
  })
);

purchasesRouter.get(
  "/:id",
  ah(async (req, res) => {
    const row = await prisma.purchase.findUnique({
      where: { id: Number(req.params.id) },
      include: { supplier: true, items: { include: { product: true, batch: true } } },
    });
    if (!row) throw new ApiError(404, "Pembelian tidak ditemukan");
    res.json(row);
  })
);

purchasesRouter.post(
  "/",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const data = purchaseSchema.parse(req.body);
    const tanggal = data.tanggal ?? new Date();

    // Ambil produk + satuannya untuk resolusi faktor konversi.
    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      include: { units: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Validasi + hitung baris di luar transaksi (cepat gagal bila ada yang salah).
    let subtotal = new Prisma.Decimal(0);
    const prepared = data.items.map((it) => {
      const product = byId.get(it.productId);
      if (!product) throw new ApiError(400, `Produk id ${it.productId} tidak ditemukan`);
      const unit = product.units.find((u) => u.namaSatuan.toLowerCase() === it.unit.toLowerCase());
      if (!unit) throw new ApiError(400, `Satuan "${it.unit}" tidak ada pada produk ${product.nama}`);

      const faktor = new Prisma.Decimal(unit.faktorKeBase);
      const qtyInput = new Prisma.Decimal(it.qtyInput);
      const modalInput = new Prisma.Decimal(it.modalInput);
      const qtyBase = qtyInput.mul(faktor);
      const modalPerBase = faktor.isZero() ? new Prisma.Decimal(0) : modalInput.div(faktor);
      const lineTotal = qtyInput.mul(modalInput);
      subtotal = subtotal.add(lineTotal);
      return { it, product, qtyBase, modalPerBase };
    });

    const total = subtotal.sub(new Prisma.Decimal(data.diskon));

    const purchase = await prisma.$transaction(async (tx) => {
      const noPembelian = await nextNoPembelian(tx, tanggal);
      const header = await tx.purchase.create({
        data: {
          noPembelian,
          supplierId: data.supplierId ?? null,
          tanggal,
          subtotal,
          diskon: data.diskon,
          total,
          statusBayar: data.statusBayar,
          jatuhTempo: data.jatuhTempo ?? null,
          userId: req.user!.id,
        },
      });

      for (const p of prepared) {
        // 1) baris pembelian
        const pi = await tx.purchaseItem.create({
          data: {
            purchaseId: header.id,
            productId: p.product.id,
            unit: p.it.unit,
            qtyInput: p.it.qtyInput,
            qtyBase: p.qtyBase,
            modalPerBase: p.modalPerBase,
          },
        });
        // 2) batch FIFO baru
        await tx.stockBatch.create({
          data: {
            productId: p.product.id,
            purchaseItemId: pi.id,
            qtyAwalBase: p.qtyBase,
            qtySisaBase: p.qtyBase,
            modalPerBase: p.modalPerBase,
            tanggalMasuk: tanggal,
          },
        });
        // 3) ledger stok masuk
        await tx.stockMovement.create({
          data: {
            productId: p.product.id,
            tipe: MovementType.in,
            qtyBase: p.qtyBase,
            refTipe: RefType.purchase,
            refId: header.id,
            keterangan: `Pembelian ${noPembelian}`,
            userId: req.user!.id,
          },
        });
        // 4) perbarui harga jual (opsional) + histori
        if (p.it.updatePrices) {
          const up = p.it.updatePrices;
          const tiers: { tier: PriceTier; old: Prisma.Decimal; next: number }[] = [
            { tier: PriceTier.aplikator, old: p.product.hargaAplikator, next: up.hargaAplikator },
            { tier: PriceTier.reseller, old: p.product.hargaReseller, next: up.hargaReseller },
            { tier: PriceTier.umum, old: p.product.hargaUmum, next: up.hargaUmum },
          ];
          const logs = tiers
            .filter((t) => !t.old.equals(new Prisma.Decimal(t.next)))
            .map((t) => ({
              productId: p.product.id,
              tier: t.tier,
              hargaLama: t.old,
              hargaBaru: new Prisma.Decimal(t.next),
              userId: req.user!.id,
            }));
          if (logs.length) {
            await tx.product.update({
              where: { id: p.product.id },
              data: {
                hargaAplikator: up.hargaAplikator,
                hargaReseller: up.hargaReseller,
                hargaUmum: up.hargaUmum,
              },
            });
            await tx.priceHistory.createMany({ data: logs });
          }
        }
      }

      return tx.purchase.findUnique({
        where: { id: header.id },
        include: { supplier: true, items: { include: { product: true, batch: true } } },
      });
    });

    res.status(201).json(purchase);
  })
);
