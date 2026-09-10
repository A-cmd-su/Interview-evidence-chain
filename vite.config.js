import { defineConfig } from "vite";

const proxy = {
  "/api": {
    target: `http://127.0.0.1:${process.env.API_PORT || 8787}`,
    changeOrigin: true,
  },
};
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: Number(process.env.WEB_PORT || 5173),
    strictPort: true,
    proxy,
  },
  preview: {
    host: "127.0.0.1",
    port: Number(process.env.PREVIEW_PORT || 4173),
    strictPort: true,
    proxy,
  },
});
