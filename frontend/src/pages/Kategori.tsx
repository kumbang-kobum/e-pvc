import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";

interface Category {
  id: number;
  nama: string;
}

export default function Kategori() {
  const [rows, setRows] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Category | null>(null);
  const [nama, setNama] = useState("");
  const [err, setErr] = useState("");

  async function load() {
    setRows((await api.get<Category[]>("/categories")).data);
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEdit(null);
    setNama("");
    setErr("");
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEdit(c);
    setNama(c.nama);
    setErr("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (edit) await api.put(`/categories/${edit.id}`, { nama });
      else await api.post("/categories", { nama });
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function del(c: Category) {
    if (!confirm(`Hapus kategori "${c.nama}"?`)) return;
    try {
      await api.delete(`/categories/${c.id}`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Gagal menghapus");
    }
  }

  return (
    <div>
      <PageHeader title="Kategori" action={<Button onClick={openNew}>+ Kategori</Button>} />
      <Table head={["Nama", ""]}>
        {rows.map((c) => (
          <tr key={c.id} className="border-b border-slate-100">
            <td className="px-4 py-3">{c.nama}</td>
            <td className="px-4 py-3 text-right">
              <button onClick={() => openEdit(c)} className="mr-3 text-blue-600 hover:underline">Edit</button>
              <button onClick={() => del(c)} className="text-red-600 hover:underline">Hapus</button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={2} className="px-4 py-8 text-center text-slate-400">Belum ada kategori</td>
          </tr>
        )}
      </Table>

      {open && (
        <Modal title={edit ? "Edit Kategori" : "Kategori Baru"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Field label="Nama Kategori">
              <Input value={nama} onChange={(e) => setNama(e.target.value)} autoFocus />
            </Field>
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
