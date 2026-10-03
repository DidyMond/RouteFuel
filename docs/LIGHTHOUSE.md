# Audit Lighthouse e verifica PWA (Milestone 5)

Audit sulle quattro schermate (Home, Risultati, Dettaglio stazione, Impostazioni) dopo le correzioni della Milestone 5. Dati grezzi in [`docs/lighthouse/summary.json`](lighthouse/summary.json); screenshot della verifica offline in `docs/lighthouse/`.

## Come è stato misurato

| | |
|---|---|
| **Build** | produzione (`pnpm build`) servita da `vite preview`, API locale, database reale |
| **Browser** | Microsoft Edge (Chromium), headless, profilo vuoto |
| **Flusso (4 schermate)** | Lighthouse **13.5.0** *user flow*, preset mobile con throttling simulato; Home e Impostazioni in modalità *navigation*, Risultati e Dettaglio in modalità *snapshot* (le due schermate nascono da una ricerca e non si possono ricaricare da sole) |
| **Punteggio PWA** | Lighthouse **11.7.1**: dalla 12 in poi la categoria PWA è stata rimossa, quindi il punteggio PWA classico si ottiene solo con la 11 |
| **Riproduzione** | `apps/web/scripts/audit/` (`lighthouse-flow.mjs`, `lighthouse-fails.mjs`, `pwa-browser-check.mjs`; istruzioni nell'intestazione di ogni script) |

## Risultati (dopo le correzioni)

| Schermata | Modalità | Prestazioni | Accessibilità | Best practice | SEO |
|---|---|---:|---:|---:|---:|
| 1 · Home | navigation | **91** | **96** | **100** | **100** |
| 2 · Risultati | snapshot | n/d (non misurabile) | **96** | **100** | **100** |
| 3 · Dettaglio stazione | snapshot | n/d (non misurabile) | **96** | **100** | **100** |
| 4 · Impostazioni | navigation | **100** | **95** | **96** | **100** |
| 4b · Impostazioni (sezioni aperte) | snapshot | n/d | **96** | **100** | **100** |
| **PWA** (Lighthouse 11, Home) | navigation | | | | **PWA 100** |

Metriche della Home (mobile, 4G lento simulato): FCP 2,7 s · LCP 2,8 s · TBT 0 ms · CLS 0,005 · Speed Index 2,7 s. Impostazioni: FCP/LCP 0,8 s · TBT 0 ms · CLS 0.

**PWA (Lighthouse 11):** `installable-manifest`, `splash-screen`, `themed-omnibox`, `content-width`, `viewport`, `maskable-icon` tutti superati → **100**. Il browser (Chromium) non segnala nessun errore di installabilità (`Page.getInstallabilityErrors` = vuoto).

Prima delle correzioni (primo giro, stessa build): Home 91 / 96 / 100 / SEO **92**; Risultati e Impostazioni con **«landmark-one-main»** fallito (nessun `<main>`), **robots.txt non valido** (27 errori: il server restituiva l'HTML) e, sulle Impostazioni, prestazioni 92 con TBT 340 ms.

## Cosa è stato corretto

| Problema | Correzione |
|---|---|
| `landmark-one-main`: Risultati e Impostazioni senza `<main>` | il contenitore di ciascuna schermata è un `<main>` (la Home e il Dettaglio lo avevano già); test su ogni schermata |
| `robots.txt` non valido (il server rispondeva con `index.html`) | `public/robots.txt` valido; controllato dalla verifica di build |
| Google Fonts bloccava il rendering (stima −1,4 s sulla Home) | caricamento non bloccante (`preload` + `media="print" onload`), con `<noscript>` di riserva; il testo si vede subito con il font di sistema (`display=swap`) |
| `sw.js` poteva restare in cache HTTP | `vercel.json`: `Cache-Control: no-cache` su `sw.js` e sul manifest, `immutable` su `/assets/*`, rewrite SPA per `/results`, `/settings`, `/station/…` |

## Problemi noti, non corretti (con motivo)

1. **`color-contrast` (accessibilità): testo bianco su `bg-primary` (`#059669`), contrasto 3,77:1** (servono 4,5:1 per testo piccolo). Riguarda i pulsanti pieni (CTA, pill attive). È la voce già in backlog M7; correggerla significa cambiare un **token di design** (`primary` o la dimensione del testo), una decisione di prodotto → **OPEN_QUESTIONS M5·2**. Tutte le altre verifiche di contrasto passano.
2. **Prestazioni della Home (91, FCP 2,7 s sul profilo mobile simulato)**: restano il CSS (26 kB) e il bundle JS (279 kB, 85 kB compressi) sul percorso critico; sopra la soglia di 80 richiesta. Margini futuri: separare ancora il codice della Home dal resto.
3. **«Errori nella console» (best practice 96 sulle Impostazioni)**: 403 di Mapbox, perché il token pubblico è ristretto per URL a `localhost:5173` e l'audit gira su `localhost:4173`. Non dipende dal codice. Per lo stesso motivo la mappa non è disegnata durante i miei audit: i punteggi di Risultati e Dettaglio non includono il costo di rendering della mappa.
4. **Prestazioni di Risultati e Dettaglio non misurabili** (modalità *snapshot*: Lighthouse non calcola metriche di caricamento); sono coperte solo accessibilità, best practice e SEO.
5. La nuova categoria sperimentale «agentic-browsing» di Lighthouse 13 non è stata considerata.

## Verifica nel browser reale (offline e installazione)

Eseguita con `apps/web/scripts/audit/pwa-browser-check.mjs` su Edge, build di produzione:

| Controllo | Esito |
|---|---|
| Service worker registrato, attivo e in controllo della pagina | ✅ scope `/`, `activated`, `controlled: true` |
| Precache della shell (HTML, JS, CSS, icone): 11 voci; font in cache a parte | ✅ |
| Chunk di Mapbox GL **non** in precache | ✅ |
| Manifest valido, nessun errore di installabilità | ✅ `installabilityErrors: []` |
| Offline: ricarica della Home dalla shell; deep link `/settings` | ✅ si caricano |
| Offline: `/results` senza ricerca riporta alla Home | ✅ |
| Offline: richieste dati (`/geocode`, `/health`, `/search`) | ✅ falliscono (nessuna cache, il service worker non ripiega su copie) |
| Online → ricerca → **voci di cache che sono dati** | ✅ **0** |
| Offline sui Risultati: mappa | ✅ «Mappa non disponibile offline», l'elenco (20 schede) resta visibile (`offline-results.png`) |
| Offline: nuova ricerca | ✅ errore chiaro «Sei offline: la ricerca ha bisogno della connessione…» (`offline-search-error.png`) |
| `beforeinstallprompt` | ✅ emesso davvero da Edge (nel primo giro il banner è comparso da solo); nel giro finale l'evento era già scattato prima del mio ascolto, quindi per provare la CTA l'ho simulato: banner compatto «Installa RouteFuel» (`install-banner.png`), `prompt()` chiamato dalla CTA, banner scompare |

Note del metodo: l'emulazione offline di Chromium non blocca le richieste fatte dal service worker (va applicata anche al suo target, come fa lo script) e, in headless, non aggiorna `navigator.onLine` (lo script lo forza per provare i messaggi); con un Chrome normale e la rete spenta `navigator.onLine` diventa `false` da solo.

**Provato dal PO (03/10/2026):** installazione su iPhone (Safari → Aggiungi alla schermata Home) e apertura offline della shell, sull'anteprima Vercel. Su iOS la Home mostra la guida di installazione (`ios-hint.png`, user agent iPhone). **Non provato:** Android.
