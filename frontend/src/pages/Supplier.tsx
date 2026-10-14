import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";

interface Supplier {
  id: number;
  nama: string;
  telp: string | null;
  alamat: string | null;
}

const empty = { nama: "", telp: "", alamat: "" };

export default function Supplier() {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState("");

  async function load() {
    setRows((await api.get<Supplier[]>("/suppliers")).data);
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
  function openEdit(s: Supplier) {
    setEditId(s.id);
    setForm({ nama: s.nama, telp: s.telp ?? "", alamat: s.alamat ?? "" });
    setErr("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (editId) await api.put(`/suppliers/${editId}`, form);
      else await api.post("/suppliers", form);
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function del(s: Supplier) {
    if (!confirm(`Hapus supplier "${s.nama}"?`)) return;
    await api.delete(`/suppliers/${s.id}`);
    load();
  }

  return (
    <div>
      <PageHeader title="Supplier" action={<Button onClick={openNew}>+ Supplier</Button>} />
      <Table head={["Nama", "Telepon", "Alamat", ""]}>
        {rows.map((s) => (
          <tr key={s.id} className="border-b border-slate-100">
            <td className="px-4 py-3">{s.nama}</td>
            <td className="px-4 py-3">{s.telp}</td>
            <td className="px-4 py-3 text-slate-500">{s.alamat}</td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button onClick={() => openEdit(s)} className="mr-3 text-blue-600 hover:underline">Edit</button>
              <button onClick={() => del(s)} className="text-red-600 hover:underline">Hapus</button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Belum ada supplier</td></tr>
        )}
      </Table>

      {open && (
        <Modal title={editId ? "Edit Supplier" : "Supplier Baru"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Field label="Nama"><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} autoFocus /></Field>
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
