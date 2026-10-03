// Elenca gli audit Lighthouse non superati di un report di flow (uso: node lighthouse-fails.mjs report-flow.json).
// Non fa parte delle dipendenze del progetto: serve un browser Chromium e, in una cartella a parte,
//   npm i puppeteer-core lighthouse@13
// Variabili: BROWSER_PATH (eseguibile di Chrome/Edge), APP (default http://localhost:4173, la build servita da `vite preview`).
import { readFileSync } from "node:fs";
const file = process.argv[2] ?? "lh-flow.json";
const result = JSON.parse(readFileSync(file, "utf8"));
for (const step of result.steps) {
  const lhr = step.lhr;
  console.log(`\n=== ${step.name}`);
  const metrics = ["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index", "interactive"];
  const m = metrics.map((id) => lhr.audits[id]).filter((a) => a && a.numericValue !== undefined).map((a) => `${id(a)}=${a.displayValue}`);
  if (m.length) console.log("  metriche:", m.join("  "));
  for (const [catId, cat] of Object.entries(lhr.categories)) {
    if (catId === "agentic-browsing") continue;
    for (const ref of cat.auditRefs) {
      const a = lhr.audits[ref.id];
      if (a.score === null || a.score >= 0.9 || a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "informative" || a.scoreDisplayMode === "manual") continue;
      const items = (a.details?.items ?? []).slice(0, 4).map((it) => it.node?.snippet ?? it.node?.selector ?? it.url ?? JSON.stringify(it).slice(0, 110));
      console.log(`  [${catId}] ${a.id} (${Math.round(a.score * 100)}) ${a.title}${a.displayValue ? " — " + a.displayValue : ""}`);
      for (const it of items) console.log(`        · ${String(it).slice(0, 150)}`);
    }
  }
}
function id(a) {
  return a.id.replace("first-contentful-paint", "FCP").replace("largest-contentful-paint", "LCP").replace("total-blocking-time", "TBT").replace("cumulative-layout-shift", "CLS").replace("speed-index", "SI").replace("interactive", "TTI");
}
