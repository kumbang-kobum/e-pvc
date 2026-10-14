import { useEffect, useState } from "react";
import { api } from "../api";

// Field pengaturan yang bisa diedit admin lewat form.
const FIELDS: { key: string; label: string; type?: string; options?: string[] }[] = [
  { key: "nama_toko", label: "Nama Toko" },
  { key: "alamat", label: "Alamat" },
  { key: "telp", label: "Telepon" },
  { key: "footer_nota", label: "Footer Nota" },
  { key: "format_no_nota", label: "Format No. Nota" },
  {
    key: "ukuran_kertas",
    label: "Ukuran Kertas Nota",
    options: ["thermal58", "thermal80", "a4", "a5"],
  },
];

interface Backup {
  file: string;
  size: number;
  waktu: string;
}

function BackupPanel() {
  const [rows, setRows] = useState<Backup[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  async function load() {
    setRows((await api.get<Backup[]>("/backup")).data);
  }
  useEffect(() => {
    load();
  }, []);

  async function backupNow() {
    setBusy(true);
    setMsg("");
    try {
      const r = await api.post("/backup");
      setMsg(`✔ Backup dibuat: ${r.data.file}`);
      load();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? "Backup gagal");
    } finally {
      setBusy(false);
    }
  }

  async function restore(f: string) {
    if (!confirm(`Pulihkan database dari "${f}"? Data saat ini akan ditimpa.`)) return;
    setBusy(true);
    setMsg("");
    try {
      await api.post("/backup/restore", { file: f });
      setMsg("✔ Database dipulihkan. Muat ulang aplikasi.");
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? "Restore gagal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 max-w-xl rounded-xl bg-white p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Backup Database</h2>
          <p className="text-sm text-slate-500">Backup otomatis harian; bisa juga manual kapan saja.</p>
        </div>
        <button onClick={backupNow} disabled={busy} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
          {busy ? "Memproses…" : "Backup Sekarang"}
        </button>
      </div>
      {msg && <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}
      <div className="divide-y divide-slate-100">
        {rows.map((b) => (
          <div key={b.file} className="flex items-center justify-between py-2 text-sm">
            <div>
              <div className="font-mono text-xs">{b.file}</div>
              <div className="text-xs text-slate-400">{new Date(b.waktu).toLocaleString("id-ID")} · {(b.size / 1024).toFixed(0)} KB</div>
            </div>
            <button onClick={() => restore(b.file)} className="text-orange-600 hover:underline">Pulihkan</button>
          </div>
        ))}
        {rows.length === 0 && <div className="py-4 text-center text-slate-400">Belum ada backup</div>}
      </div>
    </div>
  );
}

export default function Settings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<Record<string, string>>("/settings")
      .then((r) => setValues(r.data))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    const payload: Record<string, string> = {};
    for (const f of FIELDS) payload[f.key] = values[f.key] ?? "";
    await api.put("/settings", payload);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  if (loading) return <div className="text-slate-500">Memuat…</div>;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800">Pengaturan Toko</h1>
      <p className="mt-1 text-slate-500">Data ini tampil di header & nota penjualan.</p>

      <form onSubmit={handleSave} className="mt-6 max-w-xl space-y-4 rounded-xl bg-white p-6 shadow-sm">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-sm font-medium text-slate-700">{f.label}</label>
            {f.options ? (
              <select
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              >
                {f.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
              />
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-blue-600 px-5 py-2 font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Menyimpan…" : "Simpan"}
          </button>
          {saved && <span className="text-sm text-green-600">✔ Tersimpan</span>}
        </div>
      </form>

      <BackupPanel />
    </div>
  );
}
