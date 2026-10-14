import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { Button, Field, Input, Modal } from "../components/ui";
import { rupiah } from "../lib/format";

type Tier = "aplikator" | "reseller" | "umum";
interface Unit { namaSatuan: string; faktorKeBase: string | number; }
interface Product {
  id: number; sku: string; barcode: string | null; nama: string; baseUnit: string;
  hargaAplikator: string; hargaReseller: string; hargaUmum: string; stok: number; units: Unit[];
}
interface Customer { id: number; nama: string; tipeHarga: Tier; }
interface CartItem { product: Product; unit: string; qtyInput: number; }

function basePrice(p: Product, tier: Tier): number {
  return Number(tier === "aplikator" ? p.hargaAplikator : tier === "reseller" ? p.hargaReseller : p.hargaUmum);
}
function faktor(p: Product, unit: string): number {
  return Number(p.units.find((u) => u.namaSatuan === unit)?.faktorKeBase ?? 1);
}

export default function Kasir() {
  const [shift, setShift] = useState<{ id: number; saldoAwal: string } | null>(null);
  const [saldoAwal, setSaldoAwal] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [tier, setTier] = useState<Tier>("umum");
  const [customerId, setCustomerId] = useState<number | "">("");
  const [diskon, setDiskon] = useState(0);
  const [metodeBayar, setMetodeBayar] = useState<"cash" | "transfer">("cash");
  const [dibayar, setDibayar] = useState(0);
  const [jatuhTempo, setJatuhTempo] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<{ id: number; noNota: string; kembali: number } | null>(null);

  async function loadShift() {
    setShift((await api.get("/shifts/current")).data);
  }
  async function loadProducts() {
    setProducts((await api.get<Product[]>("/products")).data);
  }
  useEffect(() => {
    loadShift();
    loadProducts();
    api.get<Customer[]>("/customers").then((r) => setCustomers(r.data));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 12);
    return products
      .filter((p) => p.nama.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q))
      .slice(0, 20);
  }, [search, products]);

  const subtotal = useMemo(
    () => cart.reduce((s, c) => s + c.qtyInput * basePrice(c.product, tier) * faktor(c.product, c.unit), 0),
    [cart, tier]
  );
  const total = Math.max(0, subtotal - diskon);
  const kembali = Math.max(0, dibayar - total);
  const sisa = Math.max(0, total - dibayar);

  function addToCart(p: Product) {
    const existing = cart.find((c) => c.product.id === p.id && c.unit === p.baseUnit);
    if (existing) {
      setCart(cart.map((c) => (c === existing ? { ...c, qtyInput: c.qtyInput + 1 } : c)));
    } else {
      setCart([...cart, { product: p, unit: p.baseUnit, qtyInput: 1 }]);
    }
    setSearch("");
  }
  function setLine(i: number, patch: Partial<CartItem>) {
    setCart(cart.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }

  function pickCustomer(id: number | "") {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) setTier(c.tipeHarga);
  }

  async function openShift() {
    const s = await api.post("/shifts/open", { saldoAwal });
    setShift(s.data);
  }

  async function checkout() {
    setErr("");
    if (cart.length === 0) return setErr("Keranjang kosong");
    setSaving(true);
    try {
      const payload = {
        customerId: customerId === "" ? null : Number(customerId),
        tipeHarga: tier,
        diskon,
        metodeBayar,
        dibayar,
        jatuhTempo: sisa > 0 && jatuhTempo ? jatuhTempo : null,
        items: cart.map((c) => ({ productId: c.product.id, unit: c.unit, qtyInput: c.qtyInput })),
      };
      const res = await api.post("/sales", payload);
      setSuccess({ id: res.data.id, noNota: res.data.noNota, kembali: Number(res.data.kembali ?? 0) });
      setCart([]);
      setDiskon(0);
      setDibayar(0);
      setCustomerId("");
      setJatuhTempo("");
      loadProducts();
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? "Gagal menyimpan penjualan");
    } finally {
      setSaving(false);
    }
  }

  // Belum ada shift → wajib buka dulu.
  if (!shift) {
    return (
      <div className="grid h-full place-items-center">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
          <h1 className="mb-1 text-xl font-semibold text-slate-800">Buka Shift Kasir</h1>
          <p className="mb-5 text-sm text-slate-500">Masukkan saldo awal laci kas untuk mulai berjualan.</p>
          <Field label="Saldo Awal (Rp)">
            <Input type="number" value={saldoAwal} onChange={(e) => setSaldoAwal(Number(e.target.value))} autoFocus />
          </Field>
          <Button className="mt-4 w-full" onClick={openShift}>Buka Shift</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_380px] gap-4">
      {/* Kiri: pencarian + daftar produk */}
      <div className="flex flex-col overflow-hidden">
        <Input placeholder="Cari produk (nama / SKU / barcode)…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus className="mb-3" />
        <div className="grid flex-1 grid-cols-2 gap-2 overflow-auto pr-1 md:grid-cols-3">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.stok <= 0}
              className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-400 hover:shadow disabled:opacity-40"
            >
              <div className="line-clamp-2 text-sm font-medium text-slate-800">{p.nama}</div>
              <div className="mt-1 text-xs text-slate-400">{p.sku}</div>
              <div className="mt-2 text-sm font-semibold text-blue-600">{rupiah(basePrice(p, tier))}<span className="text-xs font-normal text-slate-400">/{p.baseUnit}</span></div>
              <div className="text-xs text-slate-400">stok {p.stok} {p.baseUnit}</div>
            </button>
          ))}
          {filtered.length === 0 && <div className="col-span-full py-8 text-center text-slate-400">Produk tidak ditemukan</div>}
        </div>
      </div>

      {/* Kanan: keranjang + pembayaran */}
      <div className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <span className="font-semibold text-slate-800">Keranjang</span>
          <select className="rounded-lg border border-slate-300 px-2 py-1 text-sm" value={tier} onChange={(e) => setTier(e.target.value as Tier)}>
            <option value="umum">Umum</option>
            <option value="reseller">Reseller</option>
            <option value="aplikator">Aplikator</option>
          </select>
        </div>

        <div className="flex-1 overflow-auto px-4">
          {cart.length === 0 && <div className="py-10 text-center text-sm text-slate-400">Belum ada barang</div>}
          {cart.map((c, i) => {
            const unitPrice = basePrice(c.product, tier) * faktor(c.product, c.unit);
            return (
              <div key={i} className="border-b border-slate-100 py-3">
                <div className="flex items-start justify-between">
                  <span className="text-sm font-medium text-slate-800">{c.product.nama}</span>
                  <button onClick={() => setCart(cart.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600">✕</button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <input type="number" min={1} step="0.001" value={c.qtyInput} onChange={(e) => setLine(i, { qtyInput: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm" />
                  <select value={c.unit} onChange={(e) => setLine(i, { unit: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1 text-sm">
                    {c.product.units.map((u) => <option key={u.namaSatuan} value={u.namaSatuan}>{u.namaSatuan}</option>)}
                  </select>
                  <span className="ml-auto text-sm font-medium text-slate-700">{rupiah(c.qtyInput * unitPrice)}</span>
                </div>
                <div className="text-xs text-slate-400">@ {rupiah(unitPrice)}</div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 border-t border-slate-100 p-4">
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <div className="flex justify-between text-sm"><span className="text-slate-500">Subtotal</span><span>{rupiah(subtotal)}</span></div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Diskon</span>
            <input type="number" value={diskon} onChange={(e) => setDiskon(Number(e.target.value))} className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm" />
          </div>
          <div className="flex justify-between text-base font-semibold text-slate-800"><span>Total</span><span>{rupiah(total)}</span></div>

          <div className="grid grid-cols-2 gap-2 pt-1">
            <select value={customerId} onChange={(e) => pickCustomer(e.target.value === "" ? "" : Number(e.target.value))} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="">Umum (tanpa customer)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.nama}</option>)}
            </select>
            <select value={metodeBayar} onChange={(e) => setMetodeBayar(e.target.value as "cash" | "transfer")} className="rounded-lg border border-slate-300 px-2 py-2 text-sm">
              <option value="cash">Cash</option>
              <option value="transfer">Transfer</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Dibayar</span>
            <input type="number" value={dibayar} onChange={(e) => setDibayar(Number(e.target.value))} className="w-32 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm" />
          </div>
          {dibayar >= total ? (
            <div className="flex justify-between text-sm text-green-600"><span>Kembali</span><span>{rupiah(kembali)}</span></div>
          ) : (
            <>
              <div className="flex justify-between text-sm text-orange-600"><span>Sisa (piutang)</span><span>{rupiah(sisa)}</span></div>
              <input type="date" value={jatuhTempo} onChange={(e) => setJatuhTempo(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1 text-sm" title="Jatuh tempo" />
            </>
          )}

          <Button className="mt-2 w-full py-3" onClick={checkout} disabled={saving || cart.length === 0}>
            {saving ? "Memproses…" : `Bayar ${rupiah(total)}`}
          </Button>
          <button className="w-full text-xs text-slate-400 hover:text-slate-600" onClick={() => { setDibayar(total); }}>uang pas</button>
        </div>
      </div>

      {success && (
        <Modal title="Transaksi Berhasil" onClose={() => setSuccess(null)}>
          <div className="text-center">
            <div className="mb-2 text-4xl">✅</div>
            <div className="text-slate-600">Nota <span className="font-mono font-medium">{success.noNota}</span> tersimpan.</div>
            {success.kembali > 0 && <div className="mt-1 text-lg font-semibold text-slate-800">Kembali {rupiah(success.kembali)}</div>}
            <div className="mt-5 flex justify-center gap-2">
              <Button variant="ghost" onClick={() => setSuccess(null)}>Transaksi Baru</Button>
              <Button onClick={() => window.open(`/nota/${success.id}`, "_blank")}>Cetak Nota</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
