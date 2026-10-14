import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";
import Produk from "./pages/Produk";
import Pembelian from "./pages/Pembelian";
import Kategori from "./pages/Kategori";
import Supplier from "./pages/Supplier";
import Customer from "./pages/Customer";
import Kasir from "./pages/Kasir";
import Penjualan from "./pages/Penjualan";
import Nota from "./pages/Nota";
import Pengguna from "./pages/Pengguna";
import Pengeluaran from "./pages/Pengeluaran";
import Opname from "./pages/Opname";
import Retur from "./pages/Retur";
import Laporan from "./pages/Laporan";
import Piutang from "./pages/Piutang";
import Layout from "./components/Layout";
import type { ReactNode } from "react";

function Protected({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="grid h-full place-items-center text-slate-500">Memuat…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Nota: halaman cetak tanpa layout (buka di tab baru) */}
      <Route path="/nota/:id" element={<Protected><Nota /></Protected>} />
      <Route
        element={
          <Protected>
            <Layout />
          </Protected>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/kasir" element={<Kasir />} />
        <Route path="/penjualan" element={<Penjualan />} />
        <Route path="/produk" element={<Protected adminOnly><Produk /></Protected>} />
        <Route path="/pembelian" element={<Protected adminOnly><Pembelian /></Protected>} />
        <Route path="/kategori" element={<Protected adminOnly><Kategori /></Protected>} />
        <Route path="/supplier" element={<Protected adminOnly><Supplier /></Protected>} />
        <Route path="/customer" element={<Protected adminOnly><Customer /></Protected>} />
        <Route path="/pengguna" element={<Protected adminOnly><Pengguna /></Protected>} />
        <Route path="/pengeluaran" element={<Protected adminOnly><Pengeluaran /></Protected>} />
        <Route path="/opname" element={<Protected adminOnly><Opname /></Protected>} />
        <Route path="/retur" element={<Protected adminOnly><Retur /></Protected>} />
        <Route path="/laporan" element={<Protected adminOnly><Laporan /></Protected>} />
        <Route path="/piutang" element={<Protected adminOnly><Piutang /></Protected>} />
        <Route
          path="/pengaturan"
          element={
            <Protected adminOnly>
              <Settings />
            </Protected>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
