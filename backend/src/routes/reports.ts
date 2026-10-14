import { Router } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { Role } from "@prisma/client";
import { ah } from "../lib/http.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

// Rentang tanggal dari query; default bulan berjalan.
function range(req: { query: Record<string, unknown> }): { from: Date; to: Date } {
  const now = new Date();
  const from = req.query.from ? new Date(String(req.query.from)) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = req.query.to ? new Date(String(req.query.to) + "T23:59:59") : now;
  return { from, to };
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

// ---------- Dashboard ----------
reportsRouter.get(
  "/dashboard",
  ah(async (_req, res) => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const agg = await prisma.sale.aggregate({
      where: { tanggal: { gte: start }, isVoid: false },
      _sum: { total: true },
      _count: true,
    });

    const cashRows = await prisma.$queryRaw<{ total: string | null }[]>(Prisma.sql`
      SELECT COALESCE(SUM(jumlah),0) total FROM payments
      WHERE metode = 'cash' AND tanggal >= ${start}
    `);

    const piutangRows = await prisma.$queryRaw<{ total: string | null }[]>(Prisma.sql`
      SELECT COALESCE(SUM(s.total - COALESCE(p.paid,0)),0) total
      FROM sales s
      LEFT JOIN (SELECT ref_id, SUM(jumlah) paid FROM payments WHERE ref_tipe='sale' GROUP BY ref_id) p ON p.ref_id = s.id
      WHERE s.is_void = 0 AND s.status_bayar IN ('dp','belum')
    `);

    const lowRows = await prisma.$queryRaw<{ c: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) c FROM (
        SELECT p.id FROM products p
        LEFT JOIN stock_batches b ON b.product_id = p.id
        WHERE p.deleted_at IS NULL
        GROUP BY p.id, p.stok_minimum
        HAVING COALESCE(SUM(b.qty_sisa_base),0) <= p.stok_minimum
      ) t
    `);

    res.json({
      omzetHariIni: num(agg._sum.total),
      transaksiHariIni: agg._count,
      cashHariIni: num(cashRows[0]?.total),
      piutangTotal: num(piutangRows[0]?.total),
      stokMenipis: num(lowRows[0]?.c),
    });
  })
);

// ---------- Laporan penjualan + laba ----------
reportsRouter.get(
  "/sales",
  ah(async (req, res) => {
    const { from, to } = range(req);

    const agg = await prisma.sale.aggregate({
      where: { tanggal: { gte: from, lte: to }, isVoid: false },
      _sum: { total: true, subtotal: true, diskon: true },
      _count: true,
    });

    const hppRows = await prisma.$queryRaw<{ hpp: string | null }[]>(Prisma.sql`
      SELECT COALESCE(SUM(si.hpp_per_base * si.qty_base),0) hpp
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.is_void = 0 AND s.tanggal BETWEEN ${from} AND ${to}
    `);

    const byMethod = await prisma.$queryRaw<{ metode: string; total: string }[]>(Prisma.sql`
      SELECT p.metode, COALESCE(SUM(p.jumlah),0) total
      FROM payments p JOIN sales s ON s.id = p.ref_id AND p.ref_tipe='sale'
      WHERE s.is_void = 0 AND s.tanggal BETWEEN ${from} AND ${to}
      GROUP BY p.metode
    `);

    const omzet = num(agg._sum.total);
    const hpp = num(hppRows[0]?.hpp);
    res.json({
      omzet,
      jumlahTransaksi: agg._count,
      totalDiskon: num(agg._sum.diskon),
      hpp,
      labaKotor: omzet - hpp,
      pembayaran: byMethod.map((m) => ({ metode: m.metode, total: num(m.total) })),
    });
  })
);

// ---------- Laba / Rugi ----------
reportsRouter.get(
  "/profit-loss",
  ah(async (req, res) => {
    const { from, to } = range(req);

    const omzetRows = await prisma.sale.aggregate({
      where: { tanggal: { gte: from, lte: to }, isVoid: false },
      _sum: { total: true },
    });
    const hppRows = await prisma.$queryRaw<{ hpp: string | null }[]>(Prisma.sql`
      SELECT COALESCE(SUM(si.hpp_per_base * si.qty_base),0) hpp
      FROM sale_items si JOIN sales s ON s.id = si.sale_id
      WHERE s.is_void = 0 AND s.tanggal BETWEEN ${from} AND ${to}
    `);
    const pengRows = await prisma.expense.aggregate({
      where: { tanggal: { gte: from, lte: to } },
      _sum: { jumlah: true },
    });

    const omzet = num(omzetRows._sum.total);
    const hpp = num(hppRows[0]?.hpp);
    const labaKotor = omzet - hpp;
    const pengeluaran = num(pengRows._sum.jumlah);
    res.json({ omzet, hpp, labaKotor, pengeluaran, labaBersih: labaKotor - pengeluaran });
  })
);

// ---------- 10 barang terlaris ----------
reportsRouter.get(
  "/top-products",
  ah(async (req, res) => {
    const { from, to } = range(req);
    const limit = Math.min(Number(req.query.limit ?? 10), 50);
    const rows = await prisma.$queryRaw<{ id: number; nama: string; qty: string; nilai: string }[]>(Prisma.sql`
      SELECT p.id, p.nama, SUM(si.qty_base) qty, SUM(si.subtotal) nilai
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.is_void = 0 AND s.tanggal BETWEEN ${from} AND ${to}
      GROUP BY p.id, p.nama
      ORDER BY qty DESC
      LIMIT ${limit}
    `);
    res.json(rows.map((r) => ({ id: r.id, nama: r.nama, qty: num(r.qty), nilai: num(r.nilai) })));
  })
);

// ---------- Nilai persediaan ----------
reportsRouter.get(
  "/inventory-value",
  requireRole(Role.admin),
  ah(async (_req, res) => {
    const rows = await prisma.$queryRaw<{ id: number; nama: string; stok: string; nilai: string }[]>(Prisma.sql`
      SELECT p.id, p.nama, SUM(b.qty_sisa_base) stok, SUM(b.qty_sisa_base * b.modal_per_base) nilai
      FROM products p JOIN stock_batches b ON b.product_id = p.id
      GROUP BY p.id, p.nama
      HAVING stok > 0
      ORDER BY nilai DESC
    `);
    const items = rows.map((r) => ({ id: r.id, nama: r.nama, stok: num(r.stok), nilai: num(r.nilai) }));
    res.json({ items, total: items.reduce((s, i) => s + i.nilai, 0) });
  })
);

// ---------- Piutang (penjualan belum lunas) ----------
reportsRouter.get(
  "/receivables",
  ah(async (_req, res) => {
    const rows = await prisma.$queryRaw<
      { id: number; no_nota: string; tanggal: Date; total: string; paid: string | null; jatuh_tempo: Date | null; customer: string | null }[]
    >(Prisma.sql`
      SELECT s.id, s.no_nota, s.tanggal, s.total, s.jatuh_tempo, c.nama customer,
        (SELECT COALESCE(SUM(jumlah),0) FROM payments p WHERE p.ref_tipe='sale' AND p.ref_id=s.id) paid
      FROM sales s LEFT JOIN customers c ON c.id = s.customer_id
      WHERE s.is_void = 0 AND s.status_bayar IN ('dp','belum')
      ORDER BY s.jatuh_tempo IS NULL, s.jatuh_tempo ASC
    `);
    const items = rows.map((r) => ({
      id: r.id, noNota: r.no_nota, tanggal: r.tanggal, customer: r.customer ?? "Umum",
      total: num(r.total), paid: num(r.paid), sisa: num(r.total) - num(r.paid), jatuhTempo: r.jatuh_tempo,
    }));
    res.json({ items, total: items.reduce((s, i) => s + i.sisa, 0) });
  })
);
