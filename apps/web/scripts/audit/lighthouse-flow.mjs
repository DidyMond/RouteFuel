// Lighthouse 13 user flow sulle schermate dell'app: Home, Risultati, Dettaglio stazione, Impostazioni (ricerca reale via API locale).
// Non fa parte delle dipendenze del progetto: serve un browser Chromium e, in una cartella a parte,
//   npm i puppeteer-core lighthouse@13
// Variabili: BROWSER_PATH (eseguibile di Chrome/Edge), APP (default http://localhost:4173, la build servita da `vite preview`).
import { writeFileSync } from "node:fs";
import puppeteer from "puppeteer-core";
import { startFlow } from "lighthouse";

const EDGE = process.env.BROWSER_PATH ?? "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const APP = process.env.APP ?? "http://localhost:4173";
const OUT = process.env.OUT ?? "lh";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-first-run"] });
const page = await browser.newPage();
const flow = await startFlow(page, { name: "RouteFuel M5" }); // preset mobile di default

console.log("Home…");
await flow.navigate(APP + "/", { name: "1 Home" });

// Ricerca vera (API locale) per arrivare ai Risultati e al Dettaglio
async function pick(placeholder, text) {
  await page.click(`input[placeholder="${placeholder}"]`);
  await page.type(`input[placeholder="${placeholder}"]`, text, { delay: 10 });
  await page.waitForSelector('[role="option"]', { timeout: 15000 });
  await page.click('[role="option"]');
}
await pick("Da dove parti?", "Via Alessandro Volta 3 Ceriano");
await pick("Dove vuoi andare?", "Via del Seprio 42 Lomazzo");
await page.$eval('button[type="submit"]', (b) => b.click());
await page.waitForFunction(() => location.pathname === "/results", { timeout: 40000 });
await sleep(4000);
console.log("Risultati…");
await flow.snapshot({ name: "2 Risultati" });

await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => /^Info$/.test(b.textContent.trim()) || b.getAttribute("aria-label")?.startsWith("Info"))?.click());
await page.waitForFunction(() => location.pathname.startsWith("/station/"), { timeout: 15000 });
await sleep(3000);
console.log("Dettaglio…", await page.evaluate(() => location.pathname));
await flow.snapshot({ name: "3 Dettaglio stazione" });

console.log("Impostazioni…");
await flow.navigate(APP + "/settings", { name: "4 Impostazioni" });
// Sezioni aperte: l'audit deve vedere anche i controlli
await page.evaluate(() => document.querySelectorAll("h2 button[aria-expanded=false]").forEach((b) => b.click()));
await sleep(500);
await flow.snapshot({ name: "4b Impostazioni (sezioni aperte)" });

const report = await flow.generateReport();
writeFileSync(`${OUT}-flow.html`, report);
const result = await flow.createFlowResult();
writeFileSync(`${OUT}-flow.json`, JSON.stringify(result));
for (const step of result.steps) {
  const scores = Object.fromEntries(Object.entries(step.lhr.categories).map(([k, c]) => [k, c.score === null ? null : Math.round(c.score * 100)]));
  console.log(step.name.padEnd(36), JSON.stringify(scores));
}
await browser.close();
