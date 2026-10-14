import { Router } from "express";
import { z } from "zod";
import { Prisma, MovementType, RefType, Role } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ah, ApiError } from "../lib/http.js";

export const opnameRouter = Router();
opnameRouter.use(requireAuth, requireRole(Role.admin));

opnameRouter.get(
  "/",
  ah(async (_req, res) => {
    const rows = await prisma.stockOpname.findMany({
      include: { user: { select: { nama: true } }, _count: { select: { items: true } } },
      orderBy: { tanggal: "desc" },
      take: 100,
    });
    res.json(rows);
  })
);

opnameRouter.get(
  "/:id",
  ah(async (req, res) => {
    const row = await prisma.stockOpname.findUnique({
      where: { id: Number(req.params.id) },
      include: { items: { include: { product: true } }, user: { select: { nama: true } } },
    });
    if (!row) throw new ApiError(404, "Opname tidak ditemukan");
    res.json(row);
  })
);

const schema = z.object({
  keterangan: z.string().optional().nullable(),
  items: z
    .array(z.object({ productId: z.coerce.number().int(), stokFisik: z.coerce.number().min(0) }))
    .min(1),
});

interface BatchRow { id: number; qty_sisa_base: string; modal_per_base: string; }

opnameRouter.post(
  "/",
  ah(async (req, res) => {
    const data = schema.parse(req.body);

    const opname = await prisma.$transaction(async (tx) => {
      const header = await tx.stockOpname.create({
        data: { keterangan: data.keterangan ?? null, userId: req.user!.id },
      });

      for (const it of data.items) {
        // Kunci batch produk ini.
        const batches = await tx.$queryRaw<BatchRow[]>(Prisma.sql`
          SELECT id, qty_sisa_base, modal_per_base FROM stock_batches
          WHERE product_id = ${it.productId} AND qty_sisa_base > 0
          ORDER BY tanggal_masuk DESC, id DESC
          FOR UPDATE
        `);
        const sistem = batches.reduce((s, b) => s.add(new Prisma.Decimal(b.qty_sisa_base)), new Prisma.Decimal(0));
        const fisik = new Prisma.Decimal(it.stokFisik);
        const selisih = fisik.sub(sistem);

        await tx.stockOpnameItem.create({
          data: { opnameId: header.id, productId: it.productId, stokSistem: sistem, stokFisik: fisik, selisih },
        });

        if (selisih.isZero()) continue;

        if (selisih.lt(0)) {
          // Fisik < sistem → kurangi dari batch termuda dulu.
          let kurang = selisih.abs();
          for (const b of batches) {
            if (kurang.lte(0)) break;
            const tersedia = new Prisma.Decimal(b.qty_sisa_base);
            const ambil = Prisma.Decimal.min(tersedia, kurang);
            await tx.stockBatch.update({ where: { id: b.id }, data: { qtySisaBase: tersedia.sub(ambil) } });
            kurang = kurang.sub(ambil);
          }
        } else {
          // Fisik > sistem → batch penyesuaian baru.
          // Modal: batch bersisa terbaru; bila tak ada, pakai batch terakhir yang pernah ada (bukan 0).
          let modal = batches.length ? new Prisma.Decimal(batches[0].modal_per_base) : new Prisma.Decimal(0);
          if (!batches.length) {
            const last = await tx.stockBatch.findFirst({
              where: { productId: it.productId },
              orderBy: { tanggalMasuk: "desc" },
            });
            if (last) modal = new Prisma.Decimal(last.modalPerBase);
          }
          await tx.stockBatch.create({
            data: {
              productId: it.productId,
              qtyAwalBase: selisih,
              qtySisaBase: selisih,
              modalPerBase: modal,
              keterangan: `Penyesuaian opname #${header.id}`,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: it.productId,
            tipe: MovementType.adjust,
            qtyBase: selisih,
            refTipe: RefType.opname,
            refId: header.id,
            keterangan: `Opname #${header.id}: sistem ${sistem} → fisik ${fisik}`,
            userId: req.user!.id,
          },
        });
      }

      return tx.stockOpname.findUnique({
        where: { id: header.id },
        include: { items: { include: { product: true } } },
      });
    });

    res.status(201).json(opname);
  })
);
