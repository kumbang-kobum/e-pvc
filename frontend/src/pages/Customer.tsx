import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";

type Tier = "aplikator" | "reseller" | "umum";
interface Customer {
  id: number;
  nama: string;
  telp: string | null;
  alamat: string | null;
  tipeHarga: Tier;
}

const empty = { nama: "", telp: "", alamat: "", tipeHarga: "umum" as Tier };
const tierLabel: Record<Tier, string> = { aplikator: "Aplikator", reseller: "Reseller", umum: "Umum" };

export default function Customer() {
  const [rows, setRows] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState("");

  async function load() {
    setRows((await api.get<Customer[]>("/customers")).data);
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEditId(null);
    setForm(empty);
    setErr("");
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditId(c.id);
    setForm({ nama: c.nama, telp: c.telp ?? "", alamat: c.alamat ?? "", tipeHarga: c.tipeHarga });
    setErr("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editId) await api.put(`/customers/${editId}`, form);
      else await api.post("/customers", form);
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function del(c: Customer) {
    if (!confirm(`Hapus customer "${c.nama}"?`)) return;
    await api.delete(`/customers/${c.id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Customer" subtitle="Aplikator, reseller, dan pelanggan umum" action={<Button onClick={openNew}>+ Customer</Button>} />
      <Table head={["Nama", "Tipe Harga", "Telepon", "Alamat", ""]}>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-slate-100">
            <td className="px-4 py-3">{c.nama}</td>
            <td className="px-4 py-3">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{tierLabel[c.tipeHarga]}</span>
            </td>
            <td className="px-4 py-3">{c.telp}</td>
            <td className="px-4 py-3 text-slate-500">{c.alamat}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button onClick={() => openEdit(c)} className="mr-3 text-blue-600 hover:underline">Edit</button>
              <button onClick={() => del(c)} className="text-red-600 hover:underline">Hapus</button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada customer</td></tr>
        )}
      </Table>

      {open && (
        <Modal title={editId ? "Edit Customer" : "Customer Baru"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Field label="Nama"><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} autoFocus /></Field>
            <Field label="Tipe Harga">
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                value={form.tipeHarga}
                onChange={(e) => setForm({ ...form, tipeHarga: e.target.value as Tier })}
              >
                <option value="umum">Umum</option>
                <option value="reseller">Reseller</option>
                <option value="aplikator">Aplikator</option>
              </select>
            </Field>
            <Field label="Telepon"><Input value={form.telp} onChange={(e) => setForm({ ...form, telp: e.target.value })} /></Field>
            <Field label="Alamat"><Input value={form.alamat} onChange={(e) => setForm({ ...form, alamat: e.target.value })} /></Field>
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
