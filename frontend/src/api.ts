import axios from "axios";

// Dev: pakai proxy Vite ("/api" -> localhost:3100). Produksi (Electron): set VITE_API_URL.
const baseURL = import.meta.env.VITE_API_URL ?? "/api";

export const api = axios.create({ baseURL });

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem("token");
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("token");
      if (location.pathname !== "/login") location.assign("/login");
    }
    return Promise.reject(err);
  }
);
