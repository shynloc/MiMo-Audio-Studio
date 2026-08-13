import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const normalizeBase = (value) => {
  const path = String(value || "/audioplayer").trim();
  if (path === "/") return "/";
  return `/${path.replace(/^\/+|\/+$/g, "")}/`;
};

export default defineConfig(({ command }) => ({
  base: command === "build" ? normalizeBase(process.env.VITE_APP_BASE_PATH) : "/",
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
      },
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
}));
