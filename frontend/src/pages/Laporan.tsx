import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Input, PageHeader } from "../components/ui";
import { rupiah, qty } from "../lib/format";

interface SalesRep { omzet: number; jumlahTransaksi: number; totalDiskon: number; hpp: number; labaKotor: number; pembayaran: { metode: string; total: number }[]; }
interface PL { omzet: number; hpp: number; labaKotor: number; pengeluaran: number; labaBersih: number; }
interface Top { id: number; nama: string; qty: number; nilai: number; }

function firstOfMonth() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-semibold ${accent ?? "text-slate-800"}`}>{value}</div>
    </div>
  );
}

export default function Laporan() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [sales, setSales] = useState<SalesRep | null>(null);
  const [pl, setPL] = useState<PL | null>(null);
  const [top, setTop] = useState<Top[]>([]);

  async function load() {
    const q = `from=${from}&to=${to}`;
    const [s, p, t] = await Promise.all([
      api.get<SalesRep>(`/reports/sales?${q}`),
      api.get<PL>(`/reports/profit-loss?${q}`),
      api.get<Top[]>(`/reports/top-products?${q}&limit=10`),
    ]);
    setSales(s.data);
    setPL(p.data);
    setTop(t.data);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxQty = Math.max(1, ...top.map((t) => t.qty));

  return (
    <div>
      <PageHeader
        title="Laporan"
        subtitle="Penjualan, laba-rugi, dan barang terlaris"
        action={
          <div className="flex items-end gap-2">
            <label className="text-xs text-slate-500">Dari<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-slate-500">Sampai<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button onClick={load}>Terapkan</Button>
          </div>
        }
      />

      <h2 className="mb-2 text-sm font-medium text-slate-500">Ringkasan Penjualan</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Omzet" value={rupiah(sales?.omzet ?? 0)} accent="text-blue-600" />
        <Stat label="Jumlah Transaksi" value={String(sales?.jumlahTransaksi ?? 0)} />
        <Stat label="HPP (Modal)" value={rupiah(sales?.hpp ?? 0)} />
        <Stat label="Laba Kotor" value={rupiah(sales?.labaKotor ?? 0)} accent={(sales?.labaKotor ?? 0) < 0 ? "text-red-600" : "text-green-600"} />
      </div>

      {sales && sales.pembayaran.length > 0 && (
        <div className="mt-2 text-sm text-slate-500">
          Pembayaran: {sales.pembayaran.map((p) => `${p.metode} ${rupiah(p.total)}`).join(" · ")}
        </div>
      )}

      <h2 className="mb-2 mt-6 text-sm font-medium text-slate-500">Laba / Rugi</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Omzet" value={rupiah(pl?.omzet ?? 0)} />
        <Stat label="HPP" value={rupiah(pl?.hpp ?? 0)} />
        <Stat label="Laba Kotor" value={rupiah(pl?.labaKotor ?? 0)} />
        <Stat label="Pengeluaran" value={rupiah(pl?.pengeluaran ?? 0)} accent="text-orange-600" />
        <Stat label="Laba Bersih" value={rupiah(pl?.labaBersih ?? 0)} accent={(pl?.labaBersih ?? 0) < 0 ? "text-red-600" : "text-green-600"} />
      </div>

      <h2 className="mb-3 mt-6 text-sm font-medium text-slate-500">10 Barang Terlaris</h2>
      <div className="rounded-xl bg-white p-5 shadow-sm">
        {top.length === 0 ? (
          <div className="py-6 text-center text-slate-400">Tidak ada penjualan pada periode ini</div>
        ) : (
          top.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 py-1">
              <div className="w-6 text-right text-xs text-slate-400">{i + 1}</div>
              <div className="w-48 truncate text-sm text-slate-700" title={t.nama}>{t.nama}</div>
              <div className="flex-1"><div className="h-5 rounded bg-blue-500" style={{ width: `${(t.qty / maxQty) * 100}%`, minWidth: "2px" }} /></div>
              <div className="w-24 text-right text-sm font-medium">{qty(t.qty)}</div>
              <div className="w-32 text-right text-xs text-slate-500">{rupiah(t.nilai)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
