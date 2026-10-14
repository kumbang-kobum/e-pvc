import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";
import { rupiah, qty } from "../lib/format";

interface Unit {
  namaSatuan: string;
  faktorKeBase: number | string;
}
interface Category {
  id: number;
  nama: string;
}
interface Product {
  id: number;
  sku: string;
  barcode: string | null;
  nama: string;
  categoryId: number | null;
  category?: Category | null;
  baseUnit: string;
  hargaAplikator: string;
  hargaReseller: string;
  hargaUmum: string;
  stokMinimum: string;
  units: Unit[];
  stok: number;
}

const emptyForm = {
  sku: "",
  barcode: "",
  nama: "",
  categoryId: "" as number | "",
  baseUnit: "pcs",
  hargaAplikator: 0,
  hargaReseller: 0,
  hargaUmum: 0,
  stokMinimum: 0,
  units: [{ namaSatuan: "pcs", faktorKeBase: 1 }] as Unit[],
};

export default function Produk() {
  const [rows, setRows] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [err, setErr] = useState("");

  async function load() {
    setRows((await api.get<Product[]>("/products")).data);
  }
  useEffect(() => {
    load();
    api.get<Category[]>("/categories").then((r) => setCats(r.data));
  }, []);

  function openNew() {
    setEditId(null);
    setForm(emptyForm);
    setErr("");
    setOpen(true);
  }
  function openEdit(p: Product) {
    setEditId(p.id);
    setForm({
      sku: p.sku,
      barcode: p.barcode ?? "",
      nama: p.nama,
      categoryId: p.categoryId ?? "",
      baseUnit: p.baseUnit,
      hargaAplikator: Number(p.hargaAplikator),
      hargaReseller: Number(p.hargaReseller),
      hargaUmum: Number(p.hargaUmum),
      stokMinimum: Number(p.stokMinimum),
      units: p.units.map((u) => ({ namaSatuan: u.namaSatuan, faktorKeBase: Number(u.faktorKeBase) })),
    });
    setErr("");
    setOpen(true);
  }

  function setUnit(i: number, patch: Partial<Unit>) {
    const units = form.units.map((u, idx) => (idx === i ? { ...u, ...patch } : u));
    setForm({ ...form, units });
  }
  function addUnit() {
    setForm({ ...form, units: [...form.units, { namaSatuan: "", faktorKeBase: 1 }] });
  }
  function removeUnit(i: number) {
    setForm({ ...form, units: form.units.filter((_, idx) => idx !== i) });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const payload = {
      ...form,
      categoryId: form.categoryId === "" ? null : Number(form.categoryId),
      units: form.units.map((u) => ({ namaSatuan: u.namaSatuan, faktorKeBase: Number(u.faktorKeBase) })),
    };
    try {
      if (editId) await api.put(`/products/${editId}`, payload);
      else await api.post("/products", payload);
      setOpen(false);
      load();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan");
    }
  }

  async function del(p: Product) {
    if (!confirm(`Hapus produk "${p.nama}"?`)) return;
    try {
      await api.delete(`/products/${p.id}`);
      load();
    } catch (e: any) {
      alert(e?.response?.data?.error ?? "Gagal menghapus");
    }
  }

  return (
    <div>
      <PageHeader title="Produk" subtitle="Harga jual disimpan per satuan dasar; satuan besar = harga × faktor" action={<Button onClick={openNew}>+ Produk</Button>} />
      <Table head={["SKU", "Nama", "Kategori", "Stok", "Harga Umum", ""]}>
        {rows.map((p) => {
          const low = p.stok <= Number(p.stokMinimum);
          return (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="px-4 py-3 font-mono text-xs">{p.sku}</td>
              <td className="px-4 py-3">{p.nama}</td>
              <td className="px-4 py-3 text-slate-500">{p.category?.nama ?? "-"}</td>
              <td className="px-4 py-3">
                <span className={low ? "font-medium text-red-600" : ""}>
                  {qty(p.stok)} {p.baseUnit}
                </span>
                {low && <span className="ml-1 text-xs text-red-500">⚠ min</span>}
              </td>
              <td className="px-4 py-3">{rupiah(p.hargaUmum)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button onClick={() => openEdit(p)} className="mr-3 text-blue-600 hover:underline">Edit</button>
                <button onClick={() => del(p)} className="text-red-600 hover:underline">Hapus</button>
              </td>
            </tr>
          );
        })}
        {rows.length === 0 && (
          <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Belum ada produk</td></tr>
        )}
      </Table>

      {open && (
        <Modal title={editId ? "Edit Produk" : "Produk Baru"} onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} autoFocus /></Field>
              <Field label="Barcode (opsional)"><Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} /></Field>
            </div>
            <Field label="Nama Produk"><Input value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Kategori">
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={form.categoryId}
                  onChange={(e) => setForm({ ...form, categoryId: e.target.value === "" ? "" : Number(e.target.value) })}
                >
                  <option value="">— tanpa kategori —</option>
                  {cats.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
                </select>
              </Field>
              <Field label="Satuan Dasar (stok)">
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  value={form.baseUnit}
                  onChange={(e) => setForm({ ...form, baseUnit: e.target.value })}
                >
                  {form.units.map((u, i) => <option key={i} value={u.namaSatuan}>{u.namaSatuan || "(kosong)"}</option>)}
                </select>
              </Field>
            </div>

            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Satuan & Konversi</span>
                <button type="button" onClick={addUnit} className="text-sm text-blue-600 hover:underline">+ satuan</button>
              </div>
              <p className="mb-2 text-xs text-slate-500">Satuan dasar berfaktor 1. Contoh: dus = 15 (1 dus = 15 pcs).</p>
              {form.units.map((u, i) => (
                <div key={i} className="mb-2 flex items-center gap-2">
                  <Input placeholder="nama (pcs/dus/batang)" value={u.namaSatuan} onChange={(e) => setUnit(i, { namaSatuan: e.target.value })} />
                  <Input type="number" step="0.001" placeholder="faktor" value={u.faktorKeBase} onChange={(e) => setUnit(i, { faktorKeBase: e.target.value })} className="w-28" />
                  {form.units.length > 1 && (
                    <button type="button" onClick={() => removeUnit(i)} className="text-red-500 hover:text-red-700">✕</button>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Harga Aplikator"><Input type="number" value={form.hargaAplikator} onChange={(e) => setForm({ ...form, hargaAplikator: Number(e.target.value) })} /></Field>
              <Field label="Harga Reseller"><Input type="number" value={form.hargaReseller} onChange={(e) => setForm({ ...form, hargaReseller: Number(e.target.value) })} /></Field>
              <Field label="Harga Umum"><Input type="number" value={form.hargaUmum} onChange={(e) => setForm({ ...form, hargaUmum: Number(e.target.value) })} /></Field>
            </div>
            <Field label={`Stok Minimum (${form.baseUnit})`}><Input type="number" value={form.stokMinimum} onChange={(e) => setForm({ ...form, stokMinimum: Number(e.target.value) })} /></Field>

            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
