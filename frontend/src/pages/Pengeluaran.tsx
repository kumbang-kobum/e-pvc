import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";
import { rupiah } from "../lib/format";

interface Expense {
  id: number; kategori: string; keterangan: string | null; jumlah: string; tanggal: string; tipe: "harian" | "bulanan";
  user?: { nama: string } | null;
}

export default function Pengeluaran() {
  const [rows, setRows] = useState<Expense[]>([]);
  const [total, setTotal] = useState("0");
  const [tipe, setTipe] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kategori: "", keterangan: "", jumlah: 0, tipe: "harian" as "harian" | "bulanan" });
  const [err, setErr] = useState("");

  async function load() {
    const params = new URLSearchParams();
    if (tipe) params.set("tipe", tipe);
    const r = await api.get<{ rows: Expense[]; total: string }>(`/expenses?${params}`);
    setRows(r.data.rows);
    setTotal(r.data.total);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipe]);

  function openNew() {
    setForm({ kategori: "", keterangan: "", jumlah: 0, tipe: "harian" });
    setErr("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post("/expenses", form);
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function del(x: Expense) {
    if (!confirm(`Hapus pengeluaran "${x.kategori}"?`)) return;
    await api.delete(`/expenses/${x.id}`);
    load();
  }

  return (
    <div>
      <PageHeader
        title="Pengeluaran"
        subtitle={`Total tampil: ${rupiah(total)}`}
        action={
          <div className="flex items-center gap-2">
            <select value={tipe} onChange={(e) => setTipe(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Semua</option>
              <option value="harian">Harian</option>
              <option value="bulanan">Bulanan</option>
            </select>
            <Button onClick={openNew}>+ Pengeluaran</Button>
          </div>
        }
      />
      <Table head={["Tanggal", "Kategori", "Keterangan", "Tipe", "Jumlah", ""]}>
        {rows.map((x) => (
          <tr key={x.id} className="border-b border-slate-100">
            <td className="px-4 py-3">{new Date(x.tanggal).toLocaleDateString("id-ID")}</td>
            <td className="px-4 py-3 font-medium">{x.kategori}</td>
            <td className="px-4 py-3 text-slate-500">{x.keterangan}</td>
            <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{x.tipe}</span></td>
            <td className="px-4 py-3">{rupiah(x.jumlah)}</td>
            <td className="px-4 py-3 text-right"><button onClick={() => del(x)} className="text-red-600 hover:underline">Hapus</button></td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada pengeluaran</td></tr>
        )}
      </Table>

      {open && (
        <Modal title="Pengeluaran Baru" onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Field label="Kategori"><Input value={form.kategori} onChange={(e) => setForm({ ...form, kategori: e.target.value })} placeholder="mis. Listrik, Gaji, Transport" autoFocus /></Field>
            <Field label="Keterangan"><Input value={form.keterangan} onChange={(e) => setForm({ ...form, keterangan: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Jumlah (Rp)"><Input type="number" value={form.jumlah} onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })} /></Field>
              <Field label="Tipe">
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.tipe} onChange={(e) => setForm({ ...form, tipe: e.target.value as "harian" | "bulanan" })}>
                  <option value="harian">Harian</option>
                  <option value="bulanan">Bulanan</option>
                </select>
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
