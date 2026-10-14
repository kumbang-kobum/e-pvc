import { Router } from "express";
import { z } from "zod";
import { Prisma, MovementType, RefType, ReturnType, Role } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const returnsRouter = Router();
returnsRouter.use(requireAuth, requireRole(Role.admin));

returnsRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.returnDoc.findMany({
      include: { user: { select: { nama: true } }, _count: { select: { items: true } } },
      orderBy: { tanggal: "desc" },
      take: 100,
    });
    res.json(rows);
  })
);

// ---- Retur PENJUALAN: barang balik dari customer, stok kembali ke batch asal ----
const returJualSchema = z.object({
  saleId: z.coerce.number().int(),
  keterangan: z.string().optional().nullable(),
  items: z.array(z.object({ saleItemId: z.coerce.number().int(), qtyBase: z.coerce.number().positive() })).min(1),
});

returnsRouter.post(
  "/jual",
  ah(async (req, res) => {
    const data = returJualSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id: data.saleId },
        include: { items: { include: { costs: true } } },
      });
      if (!sale) throw new ApiError(404, "Nota tidak ditemukan");
      if (sale.isVoid) throw new ApiError(400, "Nota sudah dibatalkan");

      const doc = await tx.returnDoc.create({
        data: { tipe: ReturnType.jual, refId: sale.id, keterangan: data.keterangan ?? null, userId: req.user!.id },
      });

      let totalRefund = new Prisma.Decimal(0);
      for (const r of data.items) {
        const item = sale.items.find((i) => i.id === r.saleItemId);
        if (!item) throw new ApiError(400, `Item ${r.saleItemId} bukan bagian nota ini`);
        let sisaRetur = new Prisma.Decimal(r.qtyBase);
        if (sisaRetur.gt(item.qtyBase)) throw new ApiError(400, `Qty retur melebihi qty terjual (${item.qtyBase})`);

        // Kembalikan ke batch asal (modal asli) mengikuti rincian sale_item_costs.
        for (const c of item.costs) {
          if (sisaRetur.lte(0)) break;
          const kembali = Prisma.Decimal.min(sisaRetur, new Prisma.Decimal(c.qtyBase));
          const batch = await tx.stockBatch.findUnique({ where: { id: c.stockBatchId } });
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: { qtySisaBase: new Prisma.Decimal(batch.qtySisaBase).add(kembali) },
            });
          }
          await tx.returnItem.create({
            data: { returnId: doc.id, refItemId: item.id, productId: item.productId, qtyBase: kembali, modalPerBase: c.modalPerBase },
          });
          sisaRetur = sisaRetur.sub(kembali);
        }

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            tipe: MovementType.retur_in,
            qtyBase: new Prisma.Decimal(r.qtyBase),
            refTipe: RefType.retur,
            refId: doc.id,
            keterangan: `Retur jual ${sale.noNota}`,
            userId: req.user!.id,
          },
        });
        totalRefund = totalRefund.add(new Prisma.Decimal(r.qtyBase).mul(item.hargaJualPerBase));
      }

      return tx.returnDoc.update({ where: { id: doc.id }, data: { total: totalRefund } });
    });

    res.status(201).json(result);
  })
);

// ---- Retur PEMBELIAN: barang dikembalikan ke supplier, batch berkurang ----
const returBeliSchema = z.object({
  purchaseId: z.coerce.number().int(),
  keterangan: z.string().optional().nullable(),
  items: z.array(z.object({ purchaseItemId: z.coerce.number().int(), qtyBase: z.coerce.number().positive() })).min(1),
});

returnsRouter.post(
  "/beli",
  ah(async (req, res) => {
    const data = returBeliSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findUnique({
        where: { id: data.purchaseId },
        include: { items: { include: { batch: true, product: true } } },
      });
      if (!purchase) throw new ApiError(404, "Pembelian tidak ditemukan");

      const doc = await tx.returnDoc.create({
        data: { tipe: ReturnType.beli, refId: purchase.id, keterangan: data.keterangan ?? null, userId: req.user!.id },
      });

      let total = new Prisma.Decimal(0);
      for (const r of data.items) {
        const item = purchase.items.find((i) => i.id === r.purchaseItemId);
        if (!item || !item.batch) throw new ApiError(400, `Item ${r.purchaseItemId} tidak valid`);
        const qty = new Prisma.Decimal(r.qtyBase);
        if (qty.gt(item.batch.qtySisaBase))
          throw new ApiError(400, `Retur melebihi sisa batch (${item.batch.qtySisaBase}) — sebagian sudah terjual`);

        await tx.stockBatch.update({
          where: { id: item.batch.id },
          data: { qtySisaBase: new Prisma.Decimal(item.batch.qtySisaBase).sub(qty) },
        });
        await tx.returnItem.create({
          data: { returnId: doc.id, refItemId: item.id, productId: item.productId, qtyBase: qty, modalPerBase: item.modalPerBase },
        });
        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            tipe: MovementType.retur_out,
            qtyBase: qty.neg(),
            refTipe: RefType.retur,
            refId: doc.id,
            keterangan: `Retur beli ${purchase.noPembelian}`,
            userId: req.user!.id,
          },
        });
        total = total.add(qty.mul(item.modalPerBase));
      }

      return tx.returnDoc.update({ where: { id: doc.id }, data: { total } });
    });

    res.status(201).json(result);
  })
);
