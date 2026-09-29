import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// PWA (manifest, service worker, installabilità) è esplicitamente Milestone 5
// (docs/PLAN.md): qui solo Vite + React, nessuna configurazione anticipata.
// Il token pubblico di Mapbox arriva da apps/web/.env (VITE_MAPBOX_PUBLIC_TOKEN): Vite espone già
// nativamente le variabili con prefisso VITE_, senza plugin aggiuntivi.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
