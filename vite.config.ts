import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const build = process.env["BUILD_ID"] ?? "dev";

export default defineConfig({
  root: "src/client",
  plugins: [react()],
  define: { __BUILD_ID__: JSON.stringify(build) },
  build: { outDir: "../../dist/client", emptyOutDir: true },
  server: { proxy: { "/api": "http://localhost:8787", "/parties": { target: "http://localhost:8787", ws: true } } },
});
