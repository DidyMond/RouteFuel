// Verifica la build della PWA (dopo `pnpm build`): service worker, manifest, icone e regole di cache.
// Uso: pnpm --filter @routefuel/web verify:pwa      (esce con codice 1 se qualcosa non va)
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dist = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
  console.log(`${condition ? "ok  " : "FAIL"} ${message}`);
};
const exists = (file) => stat(resolve(dist, file)).then((s) => s.isFile(), () => false);
const text = (file) => readFile(resolve(dist, file), "utf8");

// --- file prodotti
check(await exists("sw.js"), "dist/sw.js esiste");
check(await exists("manifest.webmanifest"), "dist/manifest.webmanifest esiste");
check(await exists("index.html"), "dist/index.html esiste");

// --- manifest
const manifest = JSON.parse(await text("manifest.webmanifest"));
check(manifest.name === "RouteFuel" && manifest.short_name === "RouteFuel", "manifest: name e short_name «RouteFuel»");
check(manifest.description === "Trova il carburante al minor costo sul tuo tragitto", "manifest: description");
check(manifest.display === "standalone", "manifest: display standalone");
check(manifest.orientation === "portrait", "manifest: orientation portrait");
check(manifest.start_url === "/", "manifest: start_url «/»");
check(manifest.theme_color === "#059669", "manifest: theme_color #059669 (primary)");
check(manifest.background_color === "#f8f9ff", "manifest: background_color #f8f9ff (surface)");

/** Dimensioni di un PNG dal suo header IHDR (nessuna dipendenza). */
async function pngSize(file) {
  const buffer = await readFile(resolve(dist, file));
  const isPng = buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return isPng ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) } : null;
}
for (const size of [192, 512]) {
  const icon = manifest.icons?.find((i) => i.sizes === `${size}x${size}` && i.type === "image/png" && i.purpose === "any");
  const dimensions = icon ? await pngSize(icon.src) : null;
  check(dimensions?.width === size && dimensions?.height === size, `manifest: icona PNG ${size}x${size} presente e della misura giusta`);
}
const maskable = manifest.icons?.find((i) => i.purpose === "maskable");
const maskableSize = maskable ? await pngSize(maskable.src) : null;
check(maskableSize?.width === 512 && maskableSize?.height === 512, "manifest: icona maskable 512x512");
const appleTouch = await pngSize("apple-touch-icon.png");
check(appleTouch?.width === 180, "apple-touch-icon.png 180x180");
check(await exists("favicon.ico"), "favicon.ico esiste");
const vercel = JSON.parse(await readFile(resolve(dist, "../vercel.json"), "utf8"));
check(vercel.rewrites?.some((r) => r.source === "/(.*)" && r.destination === "/index.html"), "vercel.json: ogni percorso → index.html (serve a /results)");
check(vercel.headers?.some((h) => h.source === "/sw.js" && /no-cache/.test(JSON.stringify(h.headers))), "vercel.json: sw.js mai in cache HTTP (si aggiorna a ogni deploy)");
check((await exists("robots.txt")) && /^User-agent:/m.test(await text("robots.txt")), "robots.txt valido (altrimenti il server restituirebbe index.html)");

// --- index.html
const html = await text("index.html");
check(/<link rel="manifest" href="\/manifest\.webmanifest"/.test(html), "index.html: link al manifest");
check(/<meta name="theme-color" content="#059669"/.test(html), "index.html: theme-color");
check(/<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/.test(html), "index.html: apple-touch-icon");
check(/media="print"\s+onload="this\.media='all'"/.test(html), "index.html: Google Fonts non bloccante per il rendering");

// --- service worker: shell in precache, dati mai in cache
const sw = await text("sw.js");
check(/precacheAndRoute/.test(sw) && sw.includes("index.html"), "sw.js: precache della shell (index.html incluso)");
check(/cleanupOutdatedCaches/.test(sw), "sw.js: pulizia delle cache vecchie a ogni deploy");
check(/NavigationRoute/.test(sw), "sw.js: fallback di navigazione sulla shell (/results, /settings… anche offline)");
check(/NetworkOnly/.test(sw), "sw.js: i dati usano NetworkOnly");
check(!/NetworkFirst/.test(sw), "sw.js: nessuna strategia NetworkFirst (che servirebbe prezzi vecchi offline)");
const precacheList = sw.match(/precacheAndRoute\(\[([\s\S]*?)\]/)?.[1] ?? "";
check(precacheList.length > 0 && !/MapCanvas/.test(precacheList), "sw.js: il chunk della mappa (Mapbox GL) non è nella precache");
check(!/\/(search|geocode)\b/.test(precacheList), "sw.js: nessun endpoint dati nella precache");
check(/skipWaiting|clientsClaim/.test(sw), "sw.js: aggiornamento automatico (skipWaiting / clientsClaim)");

if (failures.length > 0) {
  console.error(`\n${failures.length} controlli falliti.`);
  process.exit(1);
}
console.log("\nBuild PWA verificata.");
