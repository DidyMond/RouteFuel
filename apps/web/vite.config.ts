import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

// Il token pubblico di Mapbox arriva da apps/web/.env (VITE_MAPBOX_PUBLIC_TOKEN): Vite espone già
// nativamente le variabili con prefisso VITE_, senza plugin aggiuntivi.

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export default defineConfig(({ mode }) => {
  // Stessa origine dell'API che usa l'app (lib/api.ts): le sue chiamate non devono mai passare da una cache.
  const apiOrigin = (loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");

  return {
    plugins: [
      react(),
      // Nei test non serve il plugin PWA (nessun service worker in jsdom).
      !process.env.VITEST &&
        VitePWA({
          // Il nuovo service worker si installa e prende il controllo da solo a ogni deploy: nessun prompt di aggiornamento.
          registerType: "autoUpdate",
          includeAssets: ["logo.svg", "favicon.ico", "apple-touch-icon.png"],
          manifest: {
            name: "RouteFuel",
            short_name: "RouteFuel",
            description: "Trova il carburante al minor costo sul tuo tragitto",
            lang: "it",
            theme_color: "#059669", // primary di DESIGN.md
            background_color: "#f8f9ff", // surface di DESIGN.md
            display: "standalone",
            orientation: "portrait",
            start_url: "/",
            scope: "/",
            icons: [
              { src: "pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
              { src: "pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
              { src: "pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
            ],
          },
          workbox: {
            // SHELL: precache versionato (cache-first). Ogni file ha l'hash del contenuto nell'URL/revisione e
            // `cleanupOutdatedCaches` elimina le versioni vecchie a ogni deploy. Include HTML, JS, CSS, icone e font.
            globPatterns: ["**/*.{js,css,html,svg,png,ico,webmanifest,woff2}"],
            cleanupOutdatedCaches: true,
            clientsClaim: true,
            skipWaiting: true,
            // Ogni percorso dell'app (/results, /settings, /station/…) apre la stessa shell, anche offline.
            navigateFallback: "index.html",
            navigateFallbackDenylist: [/^\/(search|geocode|health|admin)(\/|$)/],
            // Il chunk della mappa (Mapbox GL, ~500 kB) si scarica solo ai Risultati: non è nella shell precache.
            globIgnores: ["**/MapCanvas-*"],
            maximumFileSizeToCacheInBytes: 1_500_000,
            runtimeCaching: [
              // DATI (prezzi, ricerche, geocoding): MAI in cache. Vedi OPEN_QUESTIONS M5·1: «NetworkFirst» ripiegherebbe su
              // una copia vecchia quando la rete cade, cioè mostrerebbe prezzi non freschi; qui senza rete la richiesta
              // fallisce e l'app mostra un errore chiaro.
              {
                urlPattern: new RegExp(`^${escapeRegExp(apiOrigin)}/(search|geocode|health)`),
                handler: "NetworkOnly",
              },
              // FONT di Google Fonts (parte della shell): cache-first, il file è immutabile per URL.
              {
                urlPattern: /^https:\/\/fonts\.gstatic\.com\//,
                handler: "CacheFirst",
                options: {
                  cacheName: "routefuel-fonts-files",
                  expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                  cacheableResponse: { statuses: [0, 200] },
                },
              },
              // CSS dei font: si serve la copia in cache e si aggiorna in background.
              {
                urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
                handler: "StaleWhileRevalidate",
                options: { cacheName: "routefuel-fonts-css", expiration: { maxEntries: 5 } },
              },
            ],
          },
        }),
    ],
    server: {
      port: 5173,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test/setup.ts"],
      css: false,
    },
  };
});
