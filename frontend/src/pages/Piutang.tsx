import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";
import { rupiah } from "../lib/format";

interface Item {
  id: number; noNota: string; tanggal: string; customer: string;
  total: number; paid: number; sisa: number; jatuhTempo: string | null;
}

export default function Piutang() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [bayar, setBayar] = useState<Item | null>(null);
  const [jumlah, setJumlah] = useState(0);
  const [metode, setMetode] = useState<"cash" | "transfer">("cash");
  const [err, setErr] = useState("");

  async function load() {
    const r = await api.get<{ items: Item[]; total: number }>("/reports/receivables");
    setItems(r.data.items);
    setTotal(r.data.total);
  }
  useEffect(() => {
    load();
  }, []);

  function openBayar(it: Item) {
    setBayar(it);
    setJumlah(it.sisa);
    setMetode("cash");
    setErr("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!bayar) return;
    try {
      await api.post(`/sales/${bayar.id}/payments`, { jumlah, metode });
      setBayar(null);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan pembayaran");
    }
  }

  const overdue = (d: string | null) => d && new Date(d) < new Date();

  return (
    <div>
      <PageHeader title="Piutang" subtitle={`Total piutang berjalan: ${rupiah(total)}`} />
      <Table head={["No. Nota", "Tanggal", "Customer", "Total", "Dibayar", "Sisa", "Jatuh Tempo", ""]}>
        {items.map((it) => (
          <tr key={it.id} className="border-b border-slate-100">
            <td className="px-4 py-3 font-mono text-xs">{it.noNota}</td>
            <td className="px-4 py-3">{new Date(it.tanggal).toLocaleDateString("id-ID")}</td>
            <td className="px-4 py-3">{it.customer}</td>
            <td className="px-4 py-3">{rupiah(it.total)}</td>
            <td className="px-4 py-3 text-slate-500">{rupiah(it.paid)}</td>
            <td className="px-4 py-3 font-medium text-orange-600">{rupiah(it.sisa)}</td>
            <td className="px-4 py-3">
              {it.jatuhTempo ? (
                <span className={overdue(it.jatuhTempo) ? "font-medium text-red-600" : ""}>
                  {new Date(it.jatuhTempo).toLocaleDateString("id-ID")}{overdue(it.jatuhTempo) ? " ⚠" : ""}
                </span>
              ) : "-"}
            </td>
            <td className="px-4 py-3 text-right">
              <Button variant="ghost" onClick={() => openBayar(it)}>Bayar</Button>
            </td>
          </tr>
        ))}
        {items.length === 0 && (
          <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400">Tidak ada piutang 🎉</td></tr>
        )}
      </Table>

      {bayar && (
        <Modal title={`Pembayaran ${bayar.noNota}`} onClose={() => setBayar(null)}>
          <form onSubmit={submit} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Total</span><span>{rupiah(bayar.total)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Sudah dibayar</span><span>{rupiah(bayar.paid)}</span></div>
              <div className="flex justify-between font-medium"><span>Sisa</span><span className="text-orange-600">{rupiah(bayar.sisa)}</span></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jumlah Bayar"><Input type="number" value={jumlah} onChange={(e) => setJumlah(Number(e.target.value))} autoFocus /></Field>
              <Field label="Metode">
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" value={metode} onChange={(e) => setMetode(e.target.value as "cash" | "transfer")}>
                  <option value="cash">Cash</option>
                  <option value="transfer">Transfer</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setBayar(null)}>Batal</Button>
              <Button type="submit">Simpan Pembayaran</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
