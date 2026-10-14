import { Prisma } from "@prisma/client";

function pad(n: number, len = 4): string {
  return String(n).padStart(len, "0");
}

/** Bentuk nomor nota dari format (mis. "INV/{YYYY}/{MM}/{SEQ}"). */
export function buildNoNota(format: string, date: Date, seq: number): string {
  const yyyy = date.getFullYear();
  return format
    .replace(/\{YYYY\}/g, String(yyyy))
    .replace(/\{YY\}/g, String(yyyy).slice(-2))
    .replace(/\{MM\}/g, pad(date.getMonth() + 1, 2))
    .replace(/\{DD\}/g, pad(date.getDate(), 2))
    .replace(/\{SEQ\}/g, pad(seq));
}

/** Nomor urut penjualan ke-n dalam bulan `date`. */
export async function nextSaleSeq(tx: Prisma.TransactionClient, date: Date): Promise<number> {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 1);
  const count = await tx.sale.count({ where: { tanggal: { gte: start, lt: end } } });
  return count + 1;
}
