import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PWA (manifest, service worker, installabilità) è esplicitamente Milestone 5
// (docs/PLAN.md): qui solo Vite + React, nessuna configurazione anticipata.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
