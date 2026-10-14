import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { rupiah, qty } from "../lib/format";

interface Dash {
  omzetHariIni: number; transaksiHariIni: number; cashHariIni: number; piutangTotal: number; stokMenipis: number;
}
interface Top { id: number; nama: string; qty: number; nilai: number; }

function Card({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-xl font-semibold ${accent ?? "text-slate-800"}`}>{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [toko, setToko] = useState("");
  const [d, setD] = useState<Dash | null>(null);
  const [top, setTop] = useState<Top[]>([]);

  useEffect(() => {
    api.get<Record<string, string>>("/settings").then((r) => setToko(r.data.nama_toko ?? ""));
    api.get<Dash>("/reports/dashboard").then((r) => setD(r.data));
    api.get<Top[]>("/reports/top-products?limit=10").then((r) => setTop(r.data));
  }, []);

  const maxQty = Math.max(1, ...top.map((t) => t.qty));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Dashboard</h1>
      <p className="mt-1 text-slate-500">Halo, <span className="font-medium">{user?.nama}</span> — {toko}</p>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card label="Omzet Hari Ini" value={rupiah(d?.omzetHariIni ?? 0)} accent="text-blue-600" />
        <Card label="Transaksi Hari Ini" value={String(d?.transaksiHariIni ?? 0)} />
        <Card label="Kas Masuk (Cash)" value={rupiah(d?.cashHariIni ?? 0)} accent="text-green-600" />
        <Card label="Total Piutang" value={rupiah(d?.piutangTotal ?? 0)} accent="text-orange-600" />
        <Card label="Stok Menipis" value={String(d?.stokMenipis ?? 0)} accent={d && d.stokMenipis > 0 ? "text-red-600" : undefined} />
      </div>

      <div className="mt-6 rounded-xl bg-white p-5 shadow-sm">
        <h2 className="mb-4 font-semibold text-slate-800">10 Barang Terlaris (bulan ini)</h2>
        {top.length === 0 ? (
          <div className="py-8 text-center text-slate-400">Belum ada penjualan bulan ini</div>
        ) : (
          <div className="space-y-2">
            {top.map((t, i) => (
              <div key={t.id} className="flex items-center gap-3">
                <div className="w-6 text-right text-xs text-slate-400">{i + 1}</div>
                <div className="w-48 truncate text-sm text-slate-700" title={t.nama}>{t.nama}</div>
                <div className="flex-1">
                  <div className="h-5 rounded bg-blue-500" style={{ width: `${(t.qty / maxQty) * 100}%`, minWidth: "2px" }} />
                </div>
                <div className="w-28 text-right text-sm font-medium text-slate-700">{qty(t.qty)} terjual</div>
                <div className="w-32 text-right text-xs text-slate-500">{rupiah(t.nilai)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
