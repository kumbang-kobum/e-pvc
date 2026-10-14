import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { rupiah, qty } from "../lib/format";

interface Item { id: number; unit: string; qtyInput: string; hargaJualPerBase: string; subtotal: string; product: { nama: string }; }
interface Sale {
  id: number; noNota: string; tanggal: string; subtotal: string; diskon: string; total: string;
  statusBayar: string; isVoid: boolean; tipeHarga: string;
  items: Item[]; customer?: { nama: string } | null; user?: { nama: string } | null;
  payments: { jumlah: string; metode: string }[]; totalPaid: string; sisa: string;
}
type Size = "thermal58" | "thermal80" | "a4";

export default function Nota() {
  const { id } = useParams();
  const [sale, setSale] = useState<Sale | null>(null);
  const [toko, setToko] = useState<Record<string, string>>({});
  const [size, setSize] = useState<Size>("thermal80");

  useEffect(() => {
    api.get<Sale>(`/sales/${id}`).then((r) => setSale(r.data));
    api.get<Record<string, string>>("/settings").then((r) => {
      setToko(r.data);
      const u = r.data.ukuran_kertas as Size;
      if (u) setSize(u);
    });
  }, [id]);

  // Injeksi @page sesuai ukuran kertas terpilih.
  const pageStyle = useMemo(() => {
    if (size === "a4") return "@page { size: A4; margin: 15mm; }";
    const w = size === "thermal58" ? "58mm" : "80mm";
    return `@page { size: ${w} auto; margin: 3mm; }`;
  }, [size]);

  if (!sale) return <div className="grid h-screen place-items-center text-slate-500">Memuat…</div>;

  const isThermal = size !== "a4";
  const totalPaid = Number(sale.totalPaid);

  return (
    <div className="min-h-screen bg-slate-200 py-6">
      <style>{`${pageStyle} @media print { .no-print { display: none !important; } body { background: white; } .nota-wrap { box-shadow: none !important; margin: 0 !important; } }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-md items-center justify-center gap-2">
        <select value={size} onChange={(e) => setSize(e.target.value as Size)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
          <option value="thermal58">Thermal 58mm</option>
          <option value="thermal80">Thermal 80mm</option>
          <option value="a4">A4</option>
        </select>
        <button onClick={() => window.print()} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700">🖨 Cetak</button>
      </div>

      <div
        className={`nota-wrap mx-auto bg-white p-4 shadow ${isThermal ? "text-xs" : "p-8 text-sm"}`}
        style={{ width: size === "thermal58" ? "58mm" : size === "thermal80" ? "80mm" : "210mm", maxWidth: "100%" }}
      >
        {sale.isVoid && <div className="mb-2 text-center text-base font-bold text-red-600">** DIBATALKAN (VOID) **</div>}

        <div className="text-center">
          <div className={`font-bold ${isThermal ? "text-sm" : "text-xl"}`}>{toko.nama_toko ?? "E-pvc"}</div>
          {toko.alamat && <div className="text-slate-600">{toko.alamat}</div>}
          {toko.telp && <div className="text-slate-600">Telp: {toko.telp}</div>}
        </div>

        <div className="my-2 border-t border-dashed border-slate-400" />

        <div className="flex justify-between"><span>No</span><span className="font-mono">{sale.noNota}</span></div>
        <div className="flex justify-between"><span>Tanggal</span><span>{new Date(sale.tanggal).toLocaleString("id-ID")}</span></div>
        <div className="flex justify-between"><span>Kasir</span><span>{sale.user?.nama ?? "-"}</span></div>
        <div className="flex justify-between"><span>Customer</span><span>{sale.customer?.nama ?? "Umum"}</span></div>

        <div className="my-2 border-t border-dashed border-slate-400" />

        <table className="w-full">
          <tbody>
            {sale.items.map((it) => (
              <tr key={it.id} className="align-top">
                <td className="py-1">
                  {it.product.nama}
                  <div className="text-slate-500">
                    {qty(it.qtyInput)} {it.unit} × {rupiah(Number(it.qtyInput) ? Number(it.subtotal) / Number(it.qtyInput) : 0)}
                  </div>
                </td>
                <td className="py-1 text-right whitespace-nowrap">{rupiah(it.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2 border-t border-dashed border-slate-400" />

        <div className="flex justify-between"><span>Subtotal</span><span>{rupiah(sale.subtotal)}</span></div>
        {Number(sale.diskon) > 0 && <div className="flex justify-between"><span>Diskon</span><span>-{rupiah(sale.diskon)}</span></div>}
        <div className={`flex justify-between font-bold ${isThermal ? "text-sm" : "text-base"}`}><span>TOTAL</span><span>{rupiah(sale.total)}</span></div>

        <div className="mt-1 flex justify-between"><span>Dibayar</span><span>{rupiah(totalPaid)}</span></div>
        {totalPaid >= Number(sale.total) ? (
          <div className="flex justify-between"><span>Kembali</span><span>{rupiah(totalPaid - Number(sale.total))}</span></div>
        ) : (
          <div className="flex justify-between font-medium text-red-600"><span>Sisa</span><span>{rupiah(sale.sisa)}</span></div>
        )}
        <div className="flex justify-between"><span>Status</span><span className="uppercase">{sale.statusBayar}</span></div>

        <div className="my-2 border-t border-dashed border-slate-400" />
        <div className="text-center text-slate-600">{toko.footer_nota ?? "Terima kasih"}</div>
      </div>
    </div>
  );
}
