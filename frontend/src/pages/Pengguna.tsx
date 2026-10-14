import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";

type Role = "admin" | "kasir";
interface User {
  id: number; nama: string; username: string; role: Role; aktif: boolean;
}

export default function Pengguna() {
  const [rows, setRows] = useState<User[]>([]);
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);
  const [form, setForm] = useState({ nama: "", username: "", password: "", role: "kasir" as Role, aktif: true });
  const [err, setErr] = useState("");

  async function load() {
    setRows((await api.get<User[]>("/users")).data);
  }
  useEffect(() => {
    load();
  }, []);

  function openNew() {
    setEdit(null);
    setForm({ nama: "", username: "", password: "", role: "kasir", aktif: true });
    setErr("");
    setOpen(true);
  }
  function openEdit(u: User) {
    setEdit(u);
    setForm({ nama: u.nama, username: u.username, password: "", role: u.role, aktif: u.aktif });
    setErr("");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      if (edit) {
        await api.put(`/users/${edit.id}`, { nama: form.nama, role: form.role, aktif: form.aktif });
      } else {
        await api.post("/users", { nama: form.nama, username: form.username, password: form.password, role: form.role });
      }
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function resetPw(u: User) {
    const password = prompt(`Password baru untuk "${u.username}" (min 6 karakter):`);
    if (!password) return;
    try {
      await api.post(`/users/${u.id}/reset-password`, { password });
      alert("Password direset");
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Gagal reset");
    }
  }

  async function del(u: User) {
    if (!confirm(`Hapus pengguna "${u.nama}"?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Gagal menghapus");
    }
  }

  return (
    <div>
      <PageHeader title="Pengguna" subtitle="Kelola akun admin & kasir" action={<Button onClick={openNew}>+ Pengguna</Button>} />
      <Table head={["Nama", "Username", "Peran", "Status", ""]}>
        {rows.map((u) => (
          <tr key={u.id} className="border-b border-slate-100">
            <td className="px-4 py-3">{u.nama}</td>
            <td className="px-4 py-3 font-mono text-xs">{u.username}</td>
            <td className="px-4 py-3">
              <span className={`rounded-full px-2 py-0.5 text-xs ${u.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>{u.role}</span>
            </td>
            <td className="px-4 py-3">
              <span className={`text-xs ${u.aktif ? "text-green-600" : "text-slate-400"}`}>{u.aktif ? "Aktif" : "Nonaktif"}</span>
            </td>
            <td className="px-4 py-3 text-right whitespace-nowrap">
              <button onClick={() => openEdit(u)} className="mr-3 text-blue-600 hover:underline">Edit</button>
              <button onClick={() => resetPw(u)} className="mr-3 text-slate-600 hover:underline">Reset PW</button>
              <button onClick={() => del(u)} className="text-red-600 hover:underline">Hapus</button>
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada pengguna</td></tr>
        )}
      </Table>

      {open && (
        <Modal title={edit ? "Edit Pengguna" : "Pengguna Baru"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <Field label="Nama"><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} autoFocus /></Field>
            <Field label="Username">
              <Input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} disabled={!!edit} />
            </Field>
            {!edit && (
              <Field label="Password (min 6 karakter)">
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            )}
            <Field label="Peran">
              <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="kasir">Kasir</option>
                <option value="admin">Admin</option>
              </select>
            </Field>
            {edit && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} />
                Akun aktif
              </label>
            )}
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
