import { Router } from "express";
import { z } from "zod";
import { Prisma, PriceTier, PaymentStatus, PaymentMethod, MovementType, RefType } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { ah, ApiError } from "../lib/http.js";
import { consumeFifo } from "../lib/fifo.js";
import { buildNoNota, nextSaleSeq } from "../lib/nota.js";

export const salesRouter = Router();
salesRouter.use(requireAuth);

const itemSchema = z.object({
  productId: z.coerce.number().int(),
  unit: z.string().min(1),
  qtyInput: z.coerce.number().positive(),
  hargaJualPerBase: z.coerce.number().min(0).optional(), // override; default dari tier produk
  diskonItem: z.coerce.number().min(0).default(0),
});

const saleSchema = z.object({
  customerId: z.coerce.number().int().optional().nullable(),
  tipeHarga: z.nativeEnum(PriceTier).default(PriceTier.umum),
  tanggal: z.coerce.date().optional(),
  diskon: z.coerce.number().min(0).default(0),
  metodeBayar: z.nativeEnum(PaymentMethod).default(PaymentMethod.cash),
  dibayar: z.coerce.number().min(0).default(0),
  tujuan: z.string().optional().nullable(),
  jatuhTempo: z.coerce.date().optional().nullable(),
  items: z.array(itemSchema).min(1),
});

function tierPrice(p: { hargaAplikator: Prisma.Decimal; hargaReseller: Prisma.Decimal; hargaUmum: Prisma.Decimal }, tier: PriceTier): Prisma.Decimal {
  if (tier === PriceTier.aplikator) return p.hargaAplikator;
  if (tier === PriceTier.reseller) return p.hargaReseller;
  return p.hargaUmum;
}

function computeStatus(paid: Prisma.Decimal, total: Prisma.Decimal): PaymentStatus {
  if (paid.gte(total)) return PaymentStatus.lunas;
  if (paid.gt(0)) return PaymentStatus.dp;
  return PaymentStatus.belum;
}

// ---- Buat penjualan (atomik: potong stok FIFO + HPP + payment) ----
salesRouter.post(
  "/",
  ah(async (req, res) => {
    const data = saleSchema.parse(req.body);
    const tanggal = data.tanggal ?? new Date();

    const productIds = [...new Set(data.items.map((i) => i.productId))];
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, deletedAt: null },
      include: { units: true },
    });
    const byId = new Map(products.map((p) => [p.id, p]));

    // Hitung baris & total di luar transaksi.
    let subtotal = new Prisma.Decimal(0);
    const prepared = data.items.map((it) => {
      const product = byId.get(it.productId);
      if (!product) throw new ApiError(400, `Produk id ${it.productId} tidak ditemukan`);
      const unit = product.units.find((u) => u.namaSatuan.toLowerCase() === it.unit.toLowerCase());
      if (!unit) throw new ApiError(400, `Satuan "${it.unit}" tidak ada pada produk ${product.nama}`);
      const faktor = new Prisma.Decimal(unit.faktorKeBase);
      const qtyBase = new Prisma.Decimal(it.qtyInput).mul(faktor);
      const harga = it.hargaJualPerBase !== undefined ? new Prisma.Decimal(it.hargaJualPerBase) : tierPrice(product, data.tipeHarga);
      const diskonItem = new Prisma.Decimal(it.diskonItem);
      const lineSubtotal = qtyBase.mul(harga).sub(diskonItem);
      subtotal = subtotal.add(lineSubtotal);
      return { it, product, qtyBase, harga, diskonItem, lineSubtotal };
    });

    const total = subtotal.sub(new Prisma.Decimal(data.diskon));
    if (total.lt(0)) throw new ApiError(400, "Total tidak boleh negatif");
    const dibayar = new Prisma.Decimal(data.dibayar);
    const paid = Prisma.Decimal.min(dibayar, total); // yang teralokasi ke tagihan
    const kembali = dibayar.gt(total) ? dibayar.sub(total) : new Prisma.Decimal(0);
    const statusBayar = computeStatus(paid, total);

    // Shift terbuka milik kasir (bila ada).
    const shift = await prisma.shift.findFirst({ where: { userId: req.user!.id, tutup: null } });

    const sale = await prisma.$transaction(async (tx) => {
      const seq = await nextSaleSeq(tx, tanggal);
      const settings = await tx.setting.findUnique({ where: { key: "format_no_nota" } });
      const noNota = buildNoNota(settings?.value ?? "INV/{YYYY}/{MM}/{SEQ}", tanggal, seq);

      const header = await tx.sale.create({
        data: {
          noNota,
          customerId: data.customerId ?? null,
          tipeHarga: data.tipeHarga,
          tanggal,
          subtotal,
          diskon: data.diskon,
          ppn: 0,
          total,
          statusBayar,
          jatuhTempo: statusBayar === PaymentStatus.lunas ? null : data.jatuhTempo ?? null,
          userId: req.user!.id,
          shiftId: shift?.id ?? null,
        },
      });

      for (const p of prepared) {
        const fifo = await consumeFifo(tx, p.product.id, p.qtyBase, p.product.nama);
        const saleItem = await tx.saleItem.create({
          data: {
            saleId: header.id,
            productId: p.product.id,
            unit: p.it.unit,
            qtyInput: p.it.qtyInput,
            qtyBase: p.qtyBase,
            hargaJualPerBase: p.harga,
            diskonItem: p.diskonItem,
            hppPerBase: fifo.hppPerBase,
            subtotal: p.lineSubtotal,
          },
        });
        await tx.saleItemCost.createMany({
          data: fifo.consumptions.map((c) => ({
            saleItemId: saleItem.id,
            stockBatchId: c.stockBatchId,
            qtyBase: c.qtyBase,
            modalPerBase: c.modalPerBase,
          })),
        });
        await tx.stockMovement.create({
          data: {
            productId: p.product.id,
            tipe: MovementType.out,
            qtyBase: p.qtyBase.neg(),
            refTipe: RefType.sale,
            refId: header.id,
            keterangan: `Penjualan ${noNota}`,
            userId: req.user!.id,
          },
        });
      }

      if (paid.gt(0)) {
        await tx.payment.create({
          data: {
            refTipe: RefType.sale,
            refId: header.id,
            jumlah: paid,
            metode: data.metodeBayar,
            tujuan: data.tujuan ?? null,
            userId: req.user!.id,
          },
        });
      }

      return tx.sale.findUnique({
        where: { id: header.id },
        include: { items: { include: { product: true } }, customer: true },
      });
    });

    res.status(201).json({ ...sale, kembali: kembali.toString() });
  })
);

// ---- Daftar penjualan ----
salesRouter.get(
  "/",
  ah(async (req, res) => {
    const { from, to } = req.query as { from?: string; to?: string };
    const where: Prisma.SaleWhereInput = {};
    if (from || to) {
      where.tanggal = {};
      if (from) (where.tanggal as Prisma.DateTimeFilter).gte = new Date(from);
      if (to) (where.tanggal as Prisma.DateTimeFilter).lte = new Date(to + "T23:59:59");
    }
    const rows = await prisma.sale.findMany({
      where,
      include: { customer: true, user: { select: { nama: true } }, _count: { select: { items: true } } },
      orderBy: { tanggal: "desc" },
      take: 300,
    });
    res.json(rows);
  })
);

// ---- Detail penjualan (untuk nota & cek) ----
salesRouter.get(
  "/:id",
  ah(async (req, res) => {
    const sale = await prisma.sale.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        items: { include: { product: true } },
        customer: true,
        user: { select: { nama: true } },
      },
    });
    if (!sale) throw new ApiError(404, "Nota tidak ditemukan");
    const payments = await prisma.payment.findMany({
      where: { refTipe: RefType.sale, refId: sale.id },
      orderBy: { tanggal: "asc" },
    });
    const totalPaid = payments.reduce((s, p) => s.add(p.jumlah), new Prisma.Decimal(0));
    res.json({ ...sale, payments, totalPaid: totalPaid.toString(), sisa: new Prisma.Decimal(sale.total).sub(totalPaid).toString() });
  })
);

// ---- Tambah pembayaran (pelunasan piutang/DP) ----
const paySchema = z.object({
  jumlah: z.coerce.number().positive(),
  metode: z.nativeEnum(PaymentMethod).default(PaymentMethod.cash),
  tujuan: z.string().optional().nullable(),
});

salesRouter.post(
  "/:id/payments",
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const body = paySchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({ where: { id } });
      if (!sale) throw new ApiError(404, "Nota tidak ditemukan");
      if (sale.isVoid) throw new ApiError(400, "Nota sudah dibatalkan");

      await tx.payment.create({
        data: { refTipe: RefType.sale, refId: id, jumlah: body.jumlah, metode: body.metode, tujuan: body.tujuan ?? null, userId: req.user!.id },
      });
      const payments = await tx.payment.findMany({ where: { refTipe: RefType.sale, refId: id } });
      const totalPaid = payments.reduce((s, p) => s.add(p.jumlah), new Prisma.Decimal(0));
      const status = computeStatus(totalPaid, new Prisma.Decimal(sale.total));
      await tx.sale.update({ where: { id }, data: { statusBayar: status, jatuhTempo: status === PaymentStatus.lunas ? null : sale.jatuhTempo } });
      return { totalPaid: totalPaid.toString(), statusBayar: status };
    });
    res.json(result);
  })
);

// ---- Void / pembatalan nota (admin). Stok dikembalikan ke batch asal. ----
const voidSchema = z.object({ alasan: z.string().min(1) });

salesRouter.post(
  "/:id/void",
  requireRole(Role.admin),
  ah(async (req, res) => {
    const id = Number(req.params.id);
    const { alasan } = voidSchema.parse(req.body);

    await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: { items: { include: { costs: true } } },
      });
      if (!sale) throw new ApiError(404, "Nota tidak ditemukan");
      if (sale.isVoid) throw new ApiError(400, "Nota sudah dibatalkan sebelumnya");

      for (const item of sale.items) {
        // Kembalikan tiap porsi ke batch asalnya (modal tetap benar).
        for (const c of item.costs) {
          const batch = await tx.stockBatch.findUnique({ where: { id: c.stockBatchId } });
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { qtySisaBase: new Prisma.Decimal(batch.qtySisaBase).add(c.qtyBase) },
            });
          }
        }
        // Movement pembalik (stok masuk kembali).
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            tipe: MovementType.in,
            qtyBase: new Prisma.Decimal(item.qtyBase),
            refTipe: RefType.sale,
            refId: sale.id,
            keterangan: `VOID ${sale.noNota}`,
            userId: req.user!.id,
          },
        });
      }

      // Hapus pembayaran nota ini (uang dikembalikan) agar laporan kas tidak ikut menghitung.
      await tx.payment.deleteMany({ where: { refTipe: RefType.sale, refId: id } });

      await tx.sale.update({
        where: { id },
        data: { isVoid: true, voidAlasan: alasan, voidBy: req.user!.id, voidAt: new Date() },
      });
    });

    res.json({ ok: true });
  })
);
