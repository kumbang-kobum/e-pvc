import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Button, Input, PageHeader, Table } from "../components/ui";
import { rupiah } from "../lib/format";

interface Sale {
  id: number; noNota: string; tanggal: string; total: string; statusBayar: string; isVoid: boolean;
  customer?: { nama: string } | null; user?: { nama: string } | null; _count: { items: number };
}

const statusColor: Record<string, string> = {
  lunas: "bg-green-100 text-green-700",
  dp: "bg-yellow-100 text-yellow-700",
  belum: "bg-red-100 text-red-700",
};

export default function Penjualan() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Sale[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setRows((await api.get<Sale[]>(`/sales?${params}`)).data);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function voidSale(s: Sale) {
    const alasan = prompt(`Batalkan nota ${s.noNota}? Masukkan alasan:`);
    if (!alasan) return;
    try {
      await api.post(`/sales/${s.id}/void`, { alasan });
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Gagal membatalkan");
    }
  }

  return (
    <div>
      <PageHeader
        title="Penjualan"
        subtitle="Riwayat transaksi, cetak ulang nota, dan pembatalan"
        action={
          <div className="flex items-end gap-2">
            <label className="text-xs text-slate-500">Dari<Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="text-xs text-slate-500">Sampai<Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <Button variant="ghost" onClick={load}>Filter</Button>
          </div>
        }
      />
      <Table head={["No. Nota", "Tanggal", "Customer", "Kasir", "Item", "Total", "Status", ""]}>
        {rows.map((s) => (
          <tr key={s.id} className={`border-b border-slate-100 ${s.isVoid ? "opacity-50" : ""}`}>
            <td className="px-4 py-3 font-mono text-xs">
              {s.noNota}
              {s.isVoid && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">VOID</span>}
            </td>
            <td className="px-4 py-3">{new Date(s.tanggal).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" })}</td>
            <td className="px-4 py-3">{s.customer?.nama ?? "Umum"}</td>
            <td className="px-4 py-3 text-slate-500">{s.user?.nama ?? "-"}</td>
            <td className="px-4 py-3">{s._count.items}</td>
            <td className="px-4 py-3 font-medium">{rupiah(s.total)}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[s.statusBayar] ?? ""}`}>{s.statusBayar}</span>
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button onClick={() => window.open(`/nota/${s.id}`, "_blank")} className="mr-3 text-blue-600 hover:underline">Nota</button>
              {user?.role === "admin" && !s.isVoid && (
                <button onClick={() => voidSale(s)} className="text-red-600 hover:underline">Void</button>
              )}
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Belum ada transaksi</td></tr>
        )}
      </Table>
    </div>
  );
}
