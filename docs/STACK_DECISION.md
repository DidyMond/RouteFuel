# Stack Decision — RouteFuel

Stato: **proposta, in attesa di conferma utente.** Nessun codice verrà scritto oltre alla Milestone 0 finché questo documento non è approvato (vedi `PLAN.md`).

Criteri di valutazione per ogni layer: **costi MVP / free tier**, **complessità geospaziale**, **supporto PWA**, **evoluzione futura**.

---

## 1. Frontend

### Raccomandazione: **Vite + React 18 + TypeScript + Tailwind CSS + `vite-plugin-pwa`**

- I 5 mockup sono già scritti con Tailwind (via CDN) configurato 1:1 sui token di `DESIGN.md` (colori, radii, spacing, font) — la migrazione a Tailwind "reale" con lo stesso `tailwind.config` è meccanica.
- Nessun bisogno di SSR/SEO: RouteFuel è uno strumento interattivo dietro ricerca, non un sito di contenuto. Un SPA client-only riduce la complessità operativa (nessun runtime Node da hostare per il rendering).
- `vite-plugin-pwa` (Workbox) gestisce manifest, service worker, installabilità e caching offline della shell con configurazione minima.
- Dev server istantaneo (Vite) → iterazione rapida sui 4 screen MVP.

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **Next.js (App Router)** | SSR/SSG per eventuale futura landing page pubblica con SEO, API routes co-locate | Overhead di un runtime server per un'app che nell'MVP non ha bisogno di SSR; se in futuro serve SEO/marketing, è una migrazione contenuta (route pubbliche separate) |
| **SvelteKit** | Bundle più piccolo, ottimo per PWA "leggere" | Ecosistema mappe/geo (react-map-gl, turf integrations, librerie di charting) più maturo lato React; team assumibilmente più familiare con React |

---

## 2. Backend

### Raccomandazione: **Node.js + Fastify + TypeScript** (validazione con Zod)

- Il compito richiede esplicitamente interfacce (`RoutingProvider`, `FuelDataProvider`) con implementazioni sostituibili: questo si ottiene con semplici interfacce TS + factory/dependency injection manuale, senza bisogno del DI container di un framework opinionato.
- Fastify: overhead minimo, schema-validation nativa veloce, TypeScript-first, endpoint dell'MVP sono pochi (search, station detail, health, trigger ingestione).
- Stesso linguaggio/tipi del frontend (monorepo con pacchetto `packages/shared` di tipi condivisi: `Station`, `FuelPrice`, `SearchRequest`, ecc.).

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **NestJS** | Struttura a moduli/DI molto naturale per isolare provider intercambiabili; scala bene con un team più grande | Ceremony (decorator, moduli, DI container) non necessaria per l'ampiezza dell'MVP; le interfacce provider si ottengono comunque in modo pulito senza framework |
| **Express** | Il più diffuso, massima documentazione/esempi | Meno type-safety nativa, validazione e performance inferiori a Fastify a parità di sforzo |

---

## 3. Database

### Raccomandazione: **PostgreSQL 16 + estensione PostGIS**

- Il cuore geospaziale del prodotto — "stazioni entro una deviazione reale lungo un corridoio A→B" — è esattamente il caso d'uso per cui PostGIS esiste (`ST_Buffer` sulla polilinea di rotta, `ST_DWithin` per il filtro corridoio, indici `GIST` per query rapide su ~24k impianti).
- Standard di settore, hosting gestito con free tier disponibile (Neon, Supabase), self-host locale banale via Docker.
- Accesso dati: **Kysely** (query builder type-safe) invece di un ORM full — Prisma non modella nativamente le colonne `geometry` di PostGIS (richiederebbe comunque `Unsupported("geometry")` + query raw); Kysely dà tipi forti sulle colonne normali e query SQL/PostGIS scritte a mano dove serve, senza la doppia sintassi di Prisma.

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **Supabase (Postgres + PostGIS gestito)** | Free tier generoso, dashboard, già Postgres-compatibile (nessun lock-in reale) | Per l'MVP self-hosted in Docker è sufficiente; Supabase resta un'opzione di hosting equivalente al punto 5, non un layer DB alternativo |
| **SQLite + SpatiaLite** | Zero infrastruttura, sviluppo locale semplicissimo | Funzioni geospaziali meno mature/documentate, nessun hosting gestito standard, concorrenza scrittura limitata: rischioso da portare in produzione senza riscrivere il layer dati |

---

## 4. Provider Mappe & Routing (dietro interfaccia `RoutingProvider`)

### Raccomandazione: **Mapbox** (Directions API + Mapbox GL JS + `@turf/turf`) — verificata, confermata

Verifica effettuata (settembre 2026) su pricing/limiti reali, non solo su conoscenza pregressa:

| Prodotto | Free tier reale | Prezzo oltre free tier | Carta richiesta |
|---|---|---|---|
| Map Loads (GL JS web) | 50.000 caricamenti/mese | ~$5/1.000 (scende verso $3/1.000 a volumi alti) | Solo oltre free tier |
| Directions API | 100.000 richieste/mese | $2/1.000 (poi $1.20/1.000 a volume) | Solo oltre free tier |
| Geocoding API v6 ("temporaneo", non salvato in DB) | 100.000 richieste/mese | $0.75/1.000 | Solo oltre free tier |
| Geocoding "permanente" (risultati salvati/riusati in DB) | **Nessun free tier** | da $5/1.000 | Sì |
| Search Box API (autocomplete "nuova generazione") | Solo 500 sessioni/mese | $11.50/1.000 sessioni | Solo oltre free tier |

Punti critici emersi dalla verifica:
- **Non usare la Search Box API per l'autocomplete**: il suo free tier (500 sessioni/mese) è troppo basso per un MVP reale e il costo per sessione è molto alto. Va usata invece la **Geocoding API v6 classica** con parametro `autocomplete=true` + `proximity` — stesso risultato UX, free tier 200 volte più generoso (100.000 vs 500).
- **Nessuna carta di credito richiesta** per la creazione account né per restare nel free tier di tutti i prodotti sopra.
- **Nessuno spending cap nativo**: superato il free tier, l'uso viene fatturato automaticamente senza blocco automatico delle richieste (solo email di notifica). Questo è un rischio concreto se un token pubblico viene abusato da terzi.
  **Mitigazione obbligatoria**: token pubblico con **URL/referrer restriction** per dominio, configurabile nativamente da dashboard Mapbox (supportato da Mapbox GL JS ≥0.53.1); token separato e più permissivo solo per sviluppo locale (necessario perché `localhost` è bloccato di default su un token con restrizioni).
- **CORS**: le API Mapbox sono pensate per essere chiamate direttamente dal browser (richiesto per il funzionamento delle URL restriction basate su header `Referer`).
- **PWA/offline**: Mapbox GL JS **non ha supporto offline ufficiale lato web** (esiste solo per gli SDK nativi mobile). Per l'MVP: **non implementare mappa offline** — la PWA mette in cache solo la shell dell'app e l'ultima lista risultati JSON; se la connessione cade, si mostra un messaggio "mappa non disponibile offline" mantenendo comunque visibile la lista stazioni già caricata.
- Con debounce lato client (300–400ms, minimo 3 caratteri) sull'autocomplete, il volume di richieste stimato per un MVP resta ampiamente entro tutti i free tier per diversi mesi.

**Conclusione: Mapbox resta confermato**, con la correzione d'uso sopra (Geocoding API v6, non Search Box) e l'obbligo di configurare le URL restriction prima di qualunque deploy pubblico.

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **Google Maps Platform** | Migliore qualità dati/POI in Italia, deep-link "Apri in Google Maps" universalmente riconosciuto dagli utenti | Richiede carta di credito collegata anche per il free tier ($200/mese di credito); styling mappa più rigido |
| **OpenRouteService (self-hosted OSRM/ORS o hosted free)** | Completamente gratuito, dati OpenStreetMap, nessun vendor lock-in | Il piano hosted free è fortemente rate-limited (40 req/min, 500/giorno) — insufficiente anche per test; il self-host è un onere operativo (mantenere un motore di routing) che il vincolo tecnico vuole evitare |

> Nota: il deep-link "Apri nel Navigatore esterno" (Google Maps / Apple Maps / Waze) è indipendente dal provider di routing scelto per i calcoli — si tratta di URL scheme (`comgooglemaps://`, `maps://`, `waze://`) generati lato client, non di una chiamata API.

---

## 4b. Provider Geocoding & Autocomplete (dietro interfaccia `GeocodingProvider`)

Layer mancante nella prima versione di questo documento — necessario per gli input Origine (A) / Destinazione (B) e per la pill "Posizione attuale" (reverse geocoding) di Screen 1.

### Raccomandazione: **Mapbox Geocoding API v6** (stesso account/vendor di mappe e routing)

- Forward geocoding con `autocomplete=true`, `proximity=<lon,lat utente>` (bias di prossimità) e `country=IT` (filtro copertura Italia) per suggerimenti pertinenti mentre l'utente digita.
- Reverse geocoding per convertire le coordinate del browser (`navigator.geolocation`) in un'etichetta leggibile per la pill "Posizione attuale" — chiamata singola, non in autocomplete, quindi a basso volume.
- Stesso vendor/token di mappa e routing → un solo account da gestire, stessa logica di URL-restriction del token.
- Free tier: 100.000 richieste/mese (categoria "temporary geocoding" — risultati usati al volo, non salvati in un DB), ampiamente sufficiente per un MVP con debounce.

**Privacy/GDPR minimo:**
- Le chiamate di autocomplete partono direttamente dal browser verso Mapbox (pattern standard, CORS abilitato) con un token pubblico a restrizione di dominio: il nostro backend non riceve né logga il testo digitato carattere per carattere.
- Si usa solo "temporary geocoding": nessun indirizzo testuale viene salvato lato server in un database (coerente con l'assenza di persistenza server-side delle rotte, vedi `OPEN_QUESTIONS.md`).
- Debounce (300–400ms) e soglia minima 3 caratteri prima di interrogare, per ridurre sia i costi sia la quantità di digitazione inviata a terzi.
- Se in futuro si volesse cache-are lato server indirizzi risolti (per performance o analytics), attenzione: quello è "permanent geocoding" su Mapbox, **senza free tier** — da valutare separatamente e non nell'MVP.
- Per la posizione corrente: si passano le coordinate del browser (`navigator.geolocation`) direttamente al backend per la ricerca; la reverse-geocoding verso Mapbox serve solo per mostrare un'etichetta testuale in UI ed è opzionale/non bloccante (se fallisce si mostra "Posizione attuale" generico invece del nome via).

**Fallback/test:** `FixtureGeocodingProvider` — restituisce coordinate fisse per un set noto di indirizzi di test (es. "Milano Centrale", "Bologna Fiera"), zero chiamate di rete, usato nei test automatici.

**Gestione token (3 token distinti, mai uno solo):**
1. Token pubblico con **URL-restriction** sul dominio di produzione → usato dal browser per Map GL JS + Geocoding autocomplete/reverse.
2. Token pubblico **senza restrizione URL** → usato solo dal backend (variabile d'ambiente server-side, mai nel bundle frontend) per le chiamate Directions (route diretta + top-5 + on-demand dettaglio). Non ha protezione via Referer, quindi va protetto indirettamente con rate limiting sul nostro endpoint `/search` (vedi `PLAN.md` M1).
3. Token permissivo separato per sviluppo locale (permette `localhost`, mai committato, solo in `.env.local`).

**Caching consentito**: solo cache a breve termine (in-memory o Redis, TTL 10–15 minuti) per Directions e Geocoding, mai persistenza permanente in una tabella di database — coerente con la categoria di pricing "temporary" di Mapbox.

**Rischio di compliance aperto (segnalato, non risolto in questa sede)**: se in futuro si salvano in `localStorage` dei preset (es. "Casa"/"Lavoro") con le **coordinate già geocodificate** persistite oltre la sessione corrente, questo potrebbe rientrare nella categoria "permanent geocoding" di Mapbox (che non ha free tier) anche se il salvataggio avviene lato client e non in un nostro DB — la distinzione dei ToS Mapbox è sull'uso/persistenza del dato, non su dove è fisicamente salvato. Mitigazione raccomandata per l'MVP: salvare nei preset solo l'**indirizzo testuale**, non le coordinate, e ri-geocodificare ad ogni selezione (costo trascurabile, resta "temporary"). Una verifica formale dei Termini di Servizio Mapbox (non solo della pricing page) resta consigliata prima di un lancio pubblico.

**Nota sulla verifica pricing**: i numeri di questa sezione provengono da mapbox.com/pricing e docs.mapbox.com/accounts/guides/pricing consultati il 27 settembre 2026 (ricerca web, non lettura diretta riga-per-riga di ogni pagina ufficiale). I limiti free tier di base sono verificati con buona confidenza; i breakpoint esatti degli sconti a volume vanno riconfermati manualmente su mapbox.com/pricing prima di attivare la fatturazione reale.

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **Google Places Autocomplete + Geocoding API** | Miglior UX di autocomplete percepita, ottima copertura Italia | Richiede carta di credito anche per il free tier; introdurrebbe un secondo vendor mappe oltre a Mapbox senza un chiaro vantaggio che giustifichi la complessità aggiuntiva |
| **Photon (self-hosted, basato su OpenStreetMap/Nominatim)** | Gratuito, open-source, nessun vendor lock-in, self-hostabile in Docker | Richiede scaricare ed eseguire un indice Elasticsearch sui dati OSM dell'Italia (diversi GB) e mantenerlo aggiornato — onere operativo non giustificato per un MVP quando Mapbox copre il bisogno gratuitamente |

**Questo cambia lo stack raccomandato?** No — resta un'aggiunta nello stesso vendor (Mapbox) già scelto per mappe/routing, non un nuovo layer infrastrutturale.

---

## 5. Hosting

### Raccomandazione: **Vercel (frontend statico/PWA) + Railway (backend + cron + Postgres/PostGIS)**

- Vercel: free tier per hosting statico con CDN, dominio HTTPS gratuito, integrazione GitHub per deploy automatici.
- Railway: free tier/hobby a basso costo per un servizio Node + un job schedulato (ingestione CSV giornaliera) + add-on Postgres con estensioni abilitabili (PostGIS incluso), tutto in un'unica dashboard/fattura.

| Alternativa | Perché considerata | Perché non raccomandata ora |
|---|---|---|
| **Render** (tutto-in-uno: static site + web service + cron job + Postgres) | Un solo provider per tutto, cron job nativi | Free tier con "spin down" dopo inattività (cold start lento su richieste utente reali) |
| **Fly.io** | Ottimo per Postgres self-managed vicino ai container app, controllo fine | Setup più manuale (Dockerfile, fly.toml) rispetto a Railway/Vercel per un MVP che vuole iterare veloce |

---

## Riepilogo stack proposto

| Layer | Scelta |
|---|---|
| Frontend | Vite + React 18 + TypeScript + Tailwind CSS + vite-plugin-pwa |
| Backend | Node.js + Fastify + TypeScript + Zod |
| Accesso dati | Kysely su PostgreSQL |
| Database | PostgreSQL 16 + PostGIS (Docker locale / Neon o Railway in prod) |
| Mappe & Routing | Mapbox (Directions API + GL JS) + turf.js, dietro `RoutingProvider` |
| Geocoding & Autocomplete | Mapbox Geocoding API v6 (non Search Box API), dietro `GeocodingProvider` |
| Dati carburante | Ingestione CSV MIMIT dietro `FuelDataProvider` |
| Hosting | Vercel (frontend) + Railway (backend, cron, DB) |
| Monorepo | pnpm workspaces: `apps/web`, `apps/api`, `packages/core` (logica pura), `packages/shared` (tipi) |
| Test | Vitest (unit, logica pura in `packages/core` a zero I/O), Playwright (e2e, post-MVP) |

**In attesa della tua conferma su questo stack** (o modifiche) prima di procedere allo scaffold e alla Milestone 0. Vedi anche `OPEN_QUESTIONS.md` per i punti che richiedono una tua decisione indipendente dallo stack tecnico.
