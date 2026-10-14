import { useEffect, useState } from "react";
import { api } from "../api";
import { Button, PageHeader } from "../components/ui";
import { qty, rupiah } from "../lib/format";

type Mode = "jual" | "beli";

interface SaleLite { id: number; noNota: string; tanggal: string; isVoid: boolean; }
interface SaleItem { id: number; unit: string; qtyBase: string; hargaJualPerBase: string; product: { nama: string }; }
interface PurchaseLite { id: number; noPembelian: string; tanggal: string; }
interface PurchaseItem { id: number; unit: string; qtyBase: string; modalPerBase: string; product: { nama: string }; batch?: { qtySisaBase: string } | null; }

export default function Retur() {
  const [mode, setMode] = useState<Mode>("jual");
  const [sales, setSales] = useState<SaleLite[]>([]);
  const [purchases, setPurchases] = useState<PurchaseLite[]>([]);
  const [refId, setRefId] = useState<number | "">("");
  const [saleItems, setSaleItems] = useState<SaleItem[]>([]);
  const [purItems, setPurItems] = useState<PurchaseItem[]>([]);
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [keterangan, setKeterangan] = useState("");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<SaleLite[]>("/sales").then((r) => setSales(r.data.filter((s) => !s.isVoid)));
    api.get<PurchaseLite[]>("/purchases").then((r) => setPurchases(r.data));
  }, []);

  function reset() {
    setRefId("");
    setSaleItems([]);
    setPurItems([]);
    setQtyMap({});
    setKeterangan("");
  }

  async function pickRef(id: number | "") {
    setRefId(id);
    setQtyMap({});
    if (id === "") return;
    if (mode === "jual") {
      const r = await api.get(`/sales/${id}`);
      setSaleItems(r.data.items);
    } else {
      const r = await api.get(`/purchases/${id}`);
      setPurItems(r.data.items);
    }
  }

  async function submit() {
    setMsg("");
    if (refId === "") return setMsg("Pilih transaksi dulu");
    setSaving(true);
    try {
      if (mode === "jual") {
        const items = saleItems
          .filter((it) => qtyMap[it.id] && Number(qtyMap[it.id]) > 0)
          .map((it) => ({ saleItemId: it.id, qtyBase: Number(qtyMap[it.id]) }));
        if (!items.length) throw new Error("Isi qty retur");
        await api.post("/returns/jual", { saleId: refId, keterangan, items });
      } else {
        const items = purItems
          .filter((it) => qtyMap[it.id] && Number(qtyMap[it.id]) > 0)
          .map((it) => ({ purchaseItemId: it.id, qtyBase: Number(qtyMap[it.id]) }));
        if (!items.length) throw new Error("Isi qty retur");
        await api.post("/returns/beli", { purchaseId: refId, keterangan, items });
      }
      setMsg("✔ Retur tersimpan & stok disesuaikan");
      reset();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? e?.message ?? "Gagal menyimpan retur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader title="Retur" subtitle="Retur penjualan (stok balik ke batch asal) & retur pembelian (ke supplier)" />

      <div className="mb-4 inline-flex rounded-lg bg-slate-200 p-1">
        {(["jual", "beli"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { setMode(m); reset(); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === m ? "bg-white text-slate-800 shadow" : "text-slate-500"}`}
          >
            Retur {m === "jual" ? "Penjualan" : "Pembelian"}
          </button>
        ))}
      </div>

      {msg && <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}

      <div className="max-w-2xl space-y-4 rounded-xl bg-white p-5 shadow-sm">
        <select value={refId} onChange={(e) => pickRef(e.target.value === "" ? "" : Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">— pilih {mode === "jual" ? "nota penjualan" : "nota pembelian"} —</option>
          {mode === "jual"
            ? sales.map((s) => <option key={s.id} value={s.id}>{s.noNota} — {new Date(s.tanggal).toLocaleDateString("id-ID")}</option>)
            : purchases.map((p) => <option key={p.id} value={p.id}>{p.noPembelian} — {new Date(p.tanggal).toLocaleDateString("id-ID")}</option>)}
        </select>

        {refId !== "" && (
          <>
            <div className="divide-y divide-slate-100">
              {(mode === "jual" ? saleItems : purItems).map((it: any) => {
                const max = mode === "jual" ? Number(it.qtyBase) : Number(it.batch?.qtySisaBase ?? 0);
                return (
                  <div key={it.id} className="flex items-center gap-3 py-2">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-slate-800">{it.product.nama}</div>
                      <div className="text-xs text-slate-400">
                        {mode === "jual" ? `terjual ${qty(it.qtyBase)} (base)` : `sisa batch ${qty(it.batch?.qtySisaBase ?? 0)} (base)`}
                        {" · "}
                        {mode === "jual" ? rupiah(it.hargaJualPerBase) : rupiah(it.modalPerBase)}/base
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={max}
                      step="0.001"
                      value={qtyMap[it.id] ?? ""}
                      onChange={(e) => setQtyMap({ ...qtyMap, [it.id]: e.target.value })}
                      placeholder={`maks ${max}`}
                      className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
                    />
                  </div>
                );
              })}
            </div>
            <input value={keterangan} onChange={(e) => setKeterangan(e.target.value)} placeholder="Keterangan (opsional)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="flex justify-end">
              <Button onClick={submit} disabled={saving}>{saving ? "Menyimpan…" : "Simpan Retur"}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
