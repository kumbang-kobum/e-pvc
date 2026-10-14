import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const navItems = [
  { to: "/", label: "Dashboard", icon: "🏠", end: true },
  { to: "/kasir", label: "Kasir", icon: "🧾" },
  { to: "/penjualan", label: "Penjualan", icon: "📄" },
  { to: "/laporan", label: "Laporan", icon: "📊", adminOnly: true },
  { to: "/piutang", label: "Piutang", icon: "⏰", adminOnly: true },
  { to: "/produk", label: "Produk", icon: "📦", adminOnly: true },
  { to: "/pembelian", label: "Pembelian", icon: "🛒", adminOnly: true },
  { to: "/retur", label: "Retur", icon: "↩️", adminOnly: true },
  { to: "/opname", label: "Stok Opname", icon: "📋", adminOnly: true },
  { to: "/pengeluaran", label: "Pengeluaran", icon: "💸", adminOnly: true },
  { to: "/kategori", label: "Kategori", icon: "🏷️", adminOnly: true },
  { to: "/supplier", label: "Supplier", icon: "🚚", adminOnly: true },
  { to: "/customer", label: "Customer", icon: "👥", adminOnly: true },
  { to: "/pengguna", label: "Pengguna", icon: "🔑", adminOnly: true },
  { to: "/pengaturan", label: "Pengaturan", icon: "⚙️", adminOnly: true },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex h-full bg-slate-100">
      <aside className="flex w-60 flex-col bg-slate-900 text-slate-200">
        <div className="flex items-center gap-2 px-5 py-4 text-lg font-semibold text-white">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-600 text-sm">n2N</span>
          E-pvc
        </div>
        <nav className="flex-1 px-3">
          {navItems
            .filter((i) => !i.adminOnly || user?.role === "admin")
            .map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                end={i.end}
                className={({ isActive }) =>
                  `mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                    isActive ? "bg-blue-600 text-white" : "hover:bg-slate-800"
                  }`
                }
              >
                <span>{i.icon}</span>
                {i.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 text-sm">
          <div className="font-medium text-white">{user?.nama}</div>
          <div className="mb-3 text-xs uppercase text-slate-400">{user?.role}</div>
          <button
            onClick={handleLogout}
            className="w-full rounded-lg bg-slate-800 py-2 text-slate-200 transition hover:bg-slate-700"
          >
            Keluar
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
