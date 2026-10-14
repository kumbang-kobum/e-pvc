import { Prisma } from "@prisma/client";
import { ApiError } from "./http.js";

export interface FifoConsumption {
  stockBatchId: number;
  qtyBase: Prisma.Decimal;
  modalPerBase: Prisma.Decimal;
}

export interface FifoResult {
  totalCost: Prisma.Decimal; // total HPP untuk qty yang dikonsumsi
  hppPerBase: Prisma.Decimal; // modal rata-rata per base unit (total / qty)
  consumptions: FifoConsumption[];
}

interface LockedBatch {
  id: number;
  qty_sisa_base: string;
  modal_per_base: string;
}

/**
 * Konsumsi stok produk sebesar `qtyBase` dengan metode FIFO (batch tertua dulu).
 * - Mengunci baris batch (`FOR UPDATE`) agar aman dari 2 kasir bersamaan.
 * - Mengurangi qty_sisa tiap batch terpakai.
 * - Mengembalikan rincian batch + HPP untuk disimpan di sale_item_costs.
 * Harus dipanggil DI DALAM transaksi (tx).
 */
export async function consumeFifo(
  tx: Prisma.TransactionClient,
  productId: number,
  qtyBase: Prisma.Decimal,
  namaProduk: string
): Promise<FifoResult> {
  // Kunci batch tertua dulu (FIFO) yang masih ada sisanya.
  const batches = await tx.$queryRaw<LockedBatch[]>(Prisma.sql`
    SELECT id, qty_sisa_base, modal_per_base
    FROM stock_batches
    WHERE product_id = ${productId} AND qty_sisa_base > 0
    ORDER BY tanggal_masuk ASC, id ASC
    FOR UPDATE
  `);

  let sisaButuh = qtyBase;
  let totalCost = new Prisma.Decimal(0);
  const consumptions: FifoConsumption[] = [];

  for (const b of batches) {
    if (sisaButuh.lte(0)) break;
    const tersedia = new Prisma.Decimal(b.qty_sisa_base);
    const modal = new Prisma.Decimal(b.modal_per_base);
    const ambil = Prisma.Decimal.min(tersedia, sisaButuh);

    await tx.stockBatch.update({
      where: { id: b.id },
      data: { qtySisaBase: tersedia.sub(ambil) },
    });

    totalCost = totalCost.add(ambil.mul(modal));
    consumptions.push({ stockBatchId: b.id, qtyBase: ambil, modalPerBase: modal });
    sisaButuh = sisaButuh.sub(ambil);
  }

  if (sisaButuh.gt(0)) {
    const terpakai = qtyBase.sub(sisaButuh);
    throw new ApiError(
      400,
      `Stok "${namaProduk}" tidak cukup. Dibutuhkan ${qtyBase.toString()}, tersedia ${terpakai.toString()}.`
    );
  }

  const hppPerBase = qtyBase.isZero() ? new Prisma.Decimal(0) : totalCost.div(qtyBase);
  return { totalCost, hppPerBase, consumptions };
}
