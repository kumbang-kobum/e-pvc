export function rupiah(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return "Rp " + n.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

export function qty(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  // tampilkan tanpa desimal bila bulat
  return Number.isInteger(n) ? String(n) : n.toLocaleString("id-ID", { maximumFractionDigits: 3 });
}
