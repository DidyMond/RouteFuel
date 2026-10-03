// Verifica nel browser reale della PWA: service worker, cache, installabilità, offline, dati mai in cache, banner.
// Non fa parte delle dipendenze del progetto: serve un browser Chromium e, in una cartella a parte,
//   npm i puppeteer-core lighthouse@13
// Variabili: BROWSER_PATH (eseguibile di Chrome/Edge), APP (default http://localhost:4173, la build servita da `vite preview`).
import puppeteer from "puppeteer-core";

const EDGE = process.env.BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.APP ?? "http://localhost:4173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (k, v) => console.log(k.padEnd(52), typeof v === "string" ? v : JSON.stringify(v));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run", "--window-size=420,900"] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const client = await page.createCDPSession();
// Edge headless non aggiorna navigator.onLine con l'emulazione offline (un Chrome normale sì): lo si forza per provare i messaggi.
await page.evaluateOnNewDocument(() => {
  if (sessionStorage.getItem("__offline") === "1") Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
});
const swSessions = new Map();
async function setOffline(offline) {
  await page.setOfflineMode(offline);
  await page.evaluate((flag) => {
    sessionStorage.setItem("__offline", flag ? "1" : "0");
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => !flag });
    window.dispatchEvent(new Event(flag ? "offline" : "online"));
  }, offline);
  for (const target of browser.targets().filter((x) => x.type() === "service_worker")) {
    let s = swSessions.get(target);
    if (!s) { s = await target.createCDPSession(); await s.send("Network.enable"); swSessions.set(target, s); }
    await s.send("Network.emulateNetworkConditions", { offline, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  }
}

const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

// ---------- 1. shell, service worker, cache
await page.goto(APP, { waitUntil: "networkidle0" });
await page.evaluate(() => navigator.serviceWorker.ready);
await sleep(1500);
await page.reload({ waitUntil: "networkidle0" });
const sw = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { scope: reg?.scope, state: reg?.active?.state, controlled: !!navigator.serviceWorker.controller, script: reg?.active?.scriptURL };
});
log("1. service worker", sw);
const cacheInfo = await page.evaluate(async () => {
  const out = {};
  for (const k of await caches.keys()) out[k] = (await (await caches.open(k)).keys()).map((r) => new URL(r.url).pathname);
  return out;
});
for (const [name, urls] of Object.entries(cacheInfo)) log(`   cache ${name}`, `${urls.length} voci`);
const precache = Object.entries(cacheInfo).find(([k]) => k.includes("precache"))?.[1] ?? [];
log("   precache contiene index.html e JS/CSS", { index: precache.includes("/index.html") || precache.includes("/"), js: precache.some((u) => u.endsWith(".js")), css: precache.some((u) => u.endsWith(".css")), icons: precache.some((u) => u.includes("pwa-192")) });
log("   mappa (Mapbox GL) NON in precache", !precache.some((u) => /MapCanvas/.test(u)));

// ---------- 2. installabilità
const manifest = await client.send("Page.getAppManifest");
log("2. manifest url / errori", { url: manifest.url, errors: manifest.errors });
const installErrors = await client.send("Page.getInstallabilityErrors");
log("   installabilityErrors", installErrors.installabilityErrors);
const installable = installErrors.installabilityErrors.length === 0;
log("   INSTALLABILE", installable);

// ---------- 3. offline: la shell si carica
await setOffline(true);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 10000 });
log("3. offline, reload Home: titolo", await page.evaluate(() => [...document.querySelectorAll("h1")].find((h) => h.offsetParent)?.textContent));
log("   navigator.onLine offline", await page.evaluate(() => navigator.onLine));
log("   avviso offline visibile", await page.evaluate(() => document.body.innerText.includes("Sei offline")));
await page.goto(`${APP}/settings`, { waitUntil: "domcontentloaded" });
await page.waitForSelector("h1", { timeout: 10000 });
log("   offline, deep link /settings: titolo", await page.evaluate(() => [...document.querySelectorAll("h1")].find((h) => h.offsetParent)?.textContent));
await page.goto(`${APP}/results`, { waitUntil: "domcontentloaded" });
await sleep(800);
log("   offline, deep link /results senza ricerca → Home", await page.evaluate(() => [...document.querySelectorAll("h1")].find((h) => h.offsetParent)?.textContent));
await page.screenshot({ path: "offline-home.png" });

// ---------- 4. offline: i dati falliscono (nessuna cache)
const apiBase = process.env.API ?? "http://localhost:3011";
const fetchOffline = await page.evaluate(async (base) => {
  const results = {};
  for (const [name, req] of Object.entries({
    geocode: () => fetch(`${base}/geocode/autocomplete?q=via+roma`),
    health: () => fetch(`${base}/health`),
    search: () => fetch(`${base}/search`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }),
  })) {
    try {
      const r = await req();
      results[name] = `RISPOSTA ${r.status}`;
    } catch (e) {
      results[name] = `errore di rete (${e.name})`;
    }
  }
  return results;
}, apiBase);
log("4. offline: richieste dati", fetchOffline);

// ---------- 5. online: ricerca vera, poi offline e nuova ricerca
await setOffline(false);
await page.goto(APP, { waitUntil: "networkidle0" });
async function pick(placeholder, text) {
  await page.click(`input[placeholder="${placeholder}"]`);
  await page.type(`input[placeholder="${placeholder}"]`, text, { delay: 15 });
  await page.waitForSelector('[role="option"]', { timeout: 15000 });
  await page.click('[role="option"]');
}
await pick("Da dove parti?", "Via Alessandro Volta 3 Ceriano");
await pick("Dove vuoi andare?", "Via del Seprio 42 Lomazzo");
log("   form pronto", await page.evaluate(() => ({ inputs: [...document.querySelectorAll('main input[type=text]')].map((i) => i.value.slice(0, 20)), disabled: document.querySelector('button[type="submit"]').disabled })));
await page.$eval('button[type="submit"]', (b) => b.click());
try { await page.waitForFunction(() => location.pathname === "/results", { timeout: 30000 }); } catch (e) { await page.screenshot({ path: "search-timeout.png" }); log("   TIMEOUT ricerca, alert", await page.evaluate(() => document.querySelector('[role=alert]')?.innerText)); throw e; }
await sleep(3000);
log("5. online: ricerca → risultati", await page.evaluate(() => ({ path: location.pathname, cards: document.querySelectorAll('[data-testid="station-card"]').length })));
const afterSearchCaches = await page.evaluate(async () => {
  const urls = [];
  for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
  return urls;
});
const dataCached = afterSearchCaches.filter((u) => /localhost:3011|\/search|\/geocode/.test(u));
log("   voci di cache che sono dati (devono essere 0)", dataCached.length);

// offline con i risultati già a schermo: la mappa dice «non disponibile offline», l'elenco resta
await setOffline(true);
await sleep(600);
log("   offline sui Risultati: mappa", await page.evaluate(() => document.querySelector('[data-testid="map-region"] [role="status"]')?.innerText.replace(/\n/g, " | ")));
log("   offline sui Risultati: schede ancora visibili", await page.evaluate(() => document.querySelectorAll('[data-testid="station-card"]').length));
await page.screenshot({ path: "offline-results.png" });

// Nuova ricerca offline dalla Home (stato conservato): errore chiaro
await page.evaluate(() => [...document.querySelectorAll("nav a")].find((a) => a.textContent.includes("Cerca")).click());
await sleep(500);
await page.$eval('button[type="submit"]', (b) => b.click());
await sleep(1500);
log("   offline, nuova ricerca → errore", await page.evaluate(() => document.querySelector('[role="alert"]')?.innerText.replace(/\n/g, " | ")));
await page.screenshot({ path: "offline-search-error.png" });
await setOffline(false);

// ---------- 6. banner di installazione (evento simulato: Edge headless non lo emette da solo)
await page.goto(APP, { waitUntil: "networkidle0" });
const natural = await page.evaluate(() => new Promise((resolve) => { const t = setTimeout(() => resolve(false), 4000); window.addEventListener("beforeinstallprompt", () => { clearTimeout(t); resolve(true); }); }));
log("6. beforeinstallprompt emesso dal browser", natural);
await page.evaluate(() => {
  const e = new Event("beforeinstallprompt", { cancelable: true });
  e.prompt = () => { window.__prompted = true; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: "accepted", platform: "web" });
  window.dispatchEvent(e);
});
await sleep(400);
log("   banner visibile", await page.evaluate(() => !!document.querySelector('aside[aria-label="Installa l\'app"]')));
await page.screenshot({ path: "install-banner.png" });
await page.click('aside[aria-label="Installa l\'app"] button');
await sleep(300);
log("   CTA ha chiamato prompt()", await page.evaluate(() => window.__prompted === true));
log("   banner sparito dopo l'installazione", await page.evaluate(() => !document.querySelector('aside[aria-label="Installa l\'app"]')));

log("errori console", consoleErrors.slice(0, 8));
await browser.close();
