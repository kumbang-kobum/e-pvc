import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, Input, PageHeader, Table } from "../components/ui";
import { qty } from "../lib/format";

interface Product { id: number; nama: string; sku: string; baseUnit: string; stok: number; }

export default function Opname() {
  const [products, setProducts] = useState<Product[]>([]);
  const [fisik, setFisik] = useState<Record<number, string>>({});
  const [keterangan, setKeterangan] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setProducts((await api.get<Product[]>("/products")).data);
  }
  useEffect(() => {
    load();
  }, []);

  function selisih(p: Product): number | null {
    const v = fisik[p.id];
    if (v === undefined || v === "") return null;
    return Number(v) - p.stok;
  }

  async function submit() {
    const items = products
      .filter((p) => fisik[p.id] !== undefined && fisik[p.id] !== "")
      .map((p) => ({ productId: p.id, stokFisik: Number(fisik[p.id]) }));
    if (items.length === 0) {
      setMsg("Isi minimal satu stok fisik");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      await api.post("/opname", { keterangan, items });
      setFisik({});
      setKeterangan("");
      setMsg(`✔ Opname tersimpan, ${items.length} produk disesuaikan`);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? "Gagal menyimpan opname");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Stok Opname"
        subtitle="Masukkan hitungan fisik; selisih otomatis menyesuaikan stok (FIFO)"
        action={<Button onClick={submit} disabled={saving}>{saving ? "Menyimpan…" : "Simpan Opname"}</Button>}
      />
      {msg && <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}
      <div className="mb-3">
        <Input placeholder="Keterangan opname (opsional)" value={keterangan} onChange={(e) => setKeterangan(e.target.value)} />
      </div>
      <Table head={["Produk", "Stok Sistem", "Stok Fisik", "Selisih"]}>
        {products.map((p) => {
          const d = selisih(p);
          return (
            <tr key={p.id} className="border-b border-slate-100">
              <td className="px-4 py-3">{p.nama} <span className="text-xs text-slate-400">({p.sku})</span></td>
              <td className="px-4 py-3">{qty(p.stok)} {p.baseUnit}</td>
              <td className="px-4 py-3">
                <input
                  type="number"
                  step="0.001"
                  value={fisik[p.id] ?? ""}
                  onChange={(e) => setFisik({ ...fisik, [p.id]: e.target.value })}
                  placeholder="—"
                  className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                />
              </td>
              <td className="px-4 py-3">
                {d === null ? <span className="text-slate-300">—</span> : (
                  <span className={d === 0 ? "text-slate-500" : d > 0 ? "text-green-600" : "text-red-600"}>
                    {d > 0 ? "+" : ""}{qty(d)}
                  </span>
                )}
              </td>
            </tr>
          );
        })}
        {products.length === 0 && (
          <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">Belum ada produk</td></tr>
        )}
      </Table>
    </div>
  );
}
