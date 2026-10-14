import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal, PageHeader, Table } from "../components/ui";
import { rupiah } from "../lib/format";

interface Unit { namaSatuan: string; faktorKeBase: string | number; }
interface Product { id: number; nama: string; sku: string; baseUnit: string; units: Unit[]; }
interface Supplier { id: number; nama: string; }
interface PurchaseRow { id: number; noPembelian: string; tanggal: string; total: string; supplier?: { nama: string } | null; _count: { items: number }; }

interface ItemForm {
  productId: number | "";
  unit: string;
  qtyInput: number;
  modalInput: number;
  updatePrices: boolean;
  hargaAplikator: number;
  hargaReseller: number;
  hargaUmum: number;
}

const emptyItem: ItemForm = { productId: "", unit: "", qtyInput: 1, modalInput: 0, updatePrices: false, hargaAplikator: 0, hargaReseller: 0, hargaUmum: 0 };

export default function Pembelian() {
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [statusBayar, setStatusBayar] = useState("lunas");
  const [items, setItems] = useState<ItemForm[]>([{ ...emptyItem }]);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setRows((await api.get<PurchaseRow[]>("/purchases")).data);
  }
  useEffect(() => {
    load();
    api.get<Product[]>("/products").then((r) => setProducts(r.data));
    api.get<Supplier[]>("/suppliers").then((r) => setSuppliers(r.data));
  }, []);

  function openNew() {
    setSupplierId("");
    setStatusBayar("lunas");
    setItems([{ ...emptyItem }]);
    setErr("");
    setOpen(true);
  }

  function prod(id: number | "") {
    return products.find((p) => p.id === id);
  }

  function setItem(i: number, patch: Partial<ItemForm>) {
    setItems(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function onPickProduct(i: number, pid: number | "") {
    const p = prod(pid);
    const defaultUnit = p ? p.baseUnit : "";
    setItem(i, { productId: pid, unit: defaultUnit });
  }

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + Number(it.qtyInput || 0) * Number(it.modalInput || 0), 0),
    [items]
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const payload = {
      supplierId: supplierId === "" ? null : Number(supplierId),
      statusBayar,
      items: items
        .filter((it) => it.productId !== "")
        .map((it) => ({
          productId: Number(it.productId),
          unit: it.unit,
          qtyInput: Number(it.qtyInput),
          modalInput: Number(it.modalInput),
          ...(it.updatePrices
            ? { updatePrices: { hargaAplikator: it.hargaAplikator, hargaReseller: it.hargaReseller, hargaUmum: it.hargaUmum } }
            : {}),
        })),
    };
    if (payload.items.length === 0) {
      setErr("Tambahkan minimal satu barang");
      return;
    }
    setSaving(true);
    try {
      await api.post("/purchases", payload);
      setOpen(false);
      load();
      api.get<Product[]>("/products").then((r) => setProducts(r.data)); // refresh stok/harga
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan pembelian");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Pembelian" subtitle="Barang masuk membentuk batch FIFO dengan modal sendiri" action={<Button onClick={openNew}>+ Pembelian</Button>} />
      <Table head={["No.", "Tanggal", "Supplier", "Item", "Total"]}>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-slate-100">
            <td className="px-4 py-3 font-mono text-xs">{r.noPembelian}</td>
            <td className="px-4 py-3">{new Date(r.tanggal).toLocaleDateString("id-ID")}</td>
            <td className="px-4 py-3">{r.supplier?.nama ?? "-"}</td>
            <td className="px-4 py-3">{r._count.items} barang</td>
            <td className="px-4 py-3">{rupiah(r.total)}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Belum ada pembelian</td></tr>
        )}
      </Table>

      {open && (
        <Modal title="Pembelian Baru" onClose={() => setOpen(false)}>
          <form onSubmit={save} className="space-y-4">
            {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Supplier">
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" value={supplierId} onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}>
                  <option value="">— pilih —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.nama}</option>)}
                </select>
              </Field>
              <Field label="Status Bayar">
                <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500" value={statusBayar} onChange={(e) => setStatusBayar(e.target.value)}>
                  <option value="lunas">Lunas</option>
                  <option value="dp">DP</option>
                  <option value="belum">Belum bayar</option>
                </select>
              </Field>
            </div>

            <div className="space-y-3">
              {items.map((it, i) => {
                const p = prod(it.productId);
                return (
                  <div key={i} className="rounded-lg border border-slate-200 p-3">
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-5">
                        <select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500" value={it.productId} onChange={(e) => onPickProduct(i, e.target.value === "" ? "" : Number(e.target.value))}>
                          <option value="">— pilih produk —</option>
                          {products.map((pr) => <option key={pr.id} value={pr.id}>{pr.nama}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <select className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-blue-500" value={it.unit} onChange={(e) => setItem(i, { unit: e.target.value })} disabled={!p}>
                          {p?.units.map((u) => <option key={u.namaSatuan} value={u.namaSatuan}>{u.namaSatuan}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <Input type="number" step="0.001" placeholder="qty" value={it.qtyInput} onChange={(e) => setItem(i, { qtyInput: Number(e.target.value) })} />
                      </div>
                      <div className="col-span-3 flex items-center gap-1">
                        <Input type="number" placeholder="modal/unit" value={it.modalInput} onChange={(e) => setItem(i, { modalInput: Number(e.target.value) })} />
                        {items.length > 1 && <button type="button" onClick={() => setItems(items.filter((_, idx) => idx !== i))} className="text-red-500">✕</button>}
                      </div>
                    </div>
                    <label className="mt-2 flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={it.updatePrices} onChange={(e) => setItem(i, { updatePrices: e.target.checked })} />
                      Perbarui harga jual produk ini
                    </label>
                    {it.updatePrices && (
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        <Input type="number" placeholder="aplikator" value={it.hargaAplikator} onChange={(e) => setItem(i, { hargaAplikator: Number(e.target.value) })} />
                        <Input type="number" placeholder="reseller" value={it.hargaReseller} onChange={(e) => setItem(i, { hargaReseller: Number(e.target.value) })} />
                        <Input type="number" placeholder="umum" value={it.hargaUmum} onChange={(e) => setItem(i, { hargaUmum: Number(e.target.value) })} />
                      </div>
                    )}
                  </div>
                );
              })}
              <button type="button" onClick={() => setItems([...items, { ...emptyItem }])} className="text-sm text-blue-600 hover:underline">+ tambah barang</button>
            </div>

            <div className="flex items-center justify-between border-t border-slate-200 pt-3">
              <span className="text-sm text-slate-500">Subtotal</span>
              <span className="text-lg font-semibold text-slate-800">{rupiah(subtotal)}</span>
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan Pembelian"}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
