# RouteFuel

Webapp (PWA) che trova il distributore di carburante più conveniente **lungo** un percorso A→B — non nel raggio attorno a un punto — considerando la deviazione reale (km/minuti extra) e il risparmio netto rispetto alla media della tratta. Fonte dati ufficiale: [MIMIT OpenData (Osservaprezzi carburanti)](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti).

Documentazione di prodotto e architettura: [`docs/PRD.md`](docs/PRD.md), [`docs/PLAN.md`](docs/PLAN.md), [`docs/STACK_DECISION.md`](docs/STACK_DECISION.md), [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). Design system: [`DESIGN.md`](DESIGN.md).

Stato attuale: **Milestone 2 — Risultati & Mappa** (branch `feat/milestone-2-results-map`, in revisione; la Milestone 1 è in `main`). Ricerca A→B con prezzi in tempo reale, poi schermata Risultati con mappa Mapbox, percorso, pin dei prezzi e bottom sheet con ordinamento, filtri e navigazione esterna. Dettaglio stazione e impostazioni arriveranno nelle Milestone 3 e 4.

## Struttura del repository

Monorepo pnpm:

```
apps/
  web/     Frontend — Vite + React + TypeScript + Tailwind CSS
  api/     Backend — Fastify + TypeScript, ricerca, geocoding/routing (Mapbox), ingestione MIMIT, Kysely/PostgreSQL+PostGIS
packages/
  core/    Logica pura (parsing CSV, normalizzazione, S_net, P_avg, Self/Servito, geometria) — zero I/O, zero rete
  shared/  Tipi TypeScript condivisi (contratto API) tra web/api/core
docs/      PRD, piano, decisione stack, domande aperte
mockup/    Riferimento visivo/UX (non codice da portare over)
assets/    Logo ufficiale
```

## Prerequisiti

- Node.js ≥ 20
- pnpm ≥ 9 (consigliato 12)
- Docker Desktop (per PostgreSQL + PostGIS in locale)
- Facoltativo: un token Mapbox lato server (senza, l'API usa geocoding "fixture" e routing "mock", vedi sotto)
- Facoltativo: un token Mapbox **pubblico** per il browser, per vedere la mappa (senza, la schermata Risultati mostra solo l'elenco)

## Setup locale — passo per passo

1. **Installare le dipendenze** (dalla root del repo):

   ```bash
   pnpm install
   ```

2. **Copiare le variabili d'ambiente** per il backend:

   ```bash
   cp .env.example apps/api/.env
   ```

   I valori di default bastano per partire. Per usare **Mapbox reale** apri `apps/api/.env` e imposta `MAPBOX_SERVER_TOKEN` (un token dedicato al server, senza restrizioni URL, mai da committare: `.env` è ignorato da git). Il frontend non ha bisogno di alcun `.env` in questa milestone.

3. **Avviare PostgreSQL + PostGIS**:

   ```bash
   docker compose up -d
   ```

4. **Eseguire le migrazioni del database**:

   ```bash
   pnpm db:migrate
   ```

5. **Ingerire i dati MIMIT reali** (scarica, normalizza, fa upsert in DB — richiede internet, circa 15 secondi):

   ```bash
   pnpm ingest
   ```

   L'ingestione è idempotente. In alternativa, con l'API in esecuzione: `POST http://localhost:3001/ingest`.

6. **Token della mappa (facoltativo)**: crea su account.mapbox.com un token pubblico `routefuel-web` con restrizione URL `http://localhost:5173/`, poi crea `apps/web/.env` (ignorato da git):

   ```bash
   VITE_MAPBOX_PUBLIC_TOKEN=pk.il_tuo_token_pubblico
   ```

   Vite legge il file solo all'avvio: riavvia `pnpm dev:web` dopo averlo creato o modificato. Non usare il token del server nel browser. Dettagli e costi in `docs/OPEN_QUESTIONS.md` (punto A).

7. **Avviare backend e frontend** (in due terminali separati):

   ```bash
   pnpm dev:api
   ```

   ```bash
   pnpm dev:web
   ```

   - API su http://localhost:3001 (`GET /health`)
   - Frontend su http://localhost:5173 — **apri `localhost`, non `127.0.0.1`** (la CORS dell'API ammette solo `CORS_ORIGIN`).

## Provare la ricerca

**Dal browser:** apri http://localhost:5173, scegli partenza e destinazione dai suggerimenti (servono almeno 3 caratteri), imposta carburante, litri e deviazione massima, poi "Trova il carburante più conveniente". Si apre la schermata **Risultati**: mappa col percorso e i pin dei prezzi (verde = «Migliore») e, sotto, il foglio con le stazioni. Cambia ordinamento (Più conveniente / Minor deviazione / Sul percorso) e filtri (Solo Self, Autostrada) senza nuove chiamate; tocca un pin o una scheda per selezionarla, **Naviga** apre la navigazione esterna e **Info** il menu con Google Maps, Apple Maps e Waze. Prima compare il ranking con deviazioni *stimate* (`~`); dopo qualche secondo le prime stazioni vengono verificate col routing reale e la lista si aggiorna da sola. Dalla barra in basso, «Cerca» torna al form con i valori inseriti.

**Dalla riga di comando** (PowerShell), esempio Milano Centrale → Bologna Centrale:

```powershell
$body = '{"origin":{"lon":9.204,"lat":45.4864},"destination":{"lon":11.3426,"lat":44.5058},"fuelType":"benzina"}'
$res = Invoke-RestMethod -Method Post -Uri http://localhost:3001/search -ContentType 'application/json' -Body $body
$res.referencePrice; $res.results | Select-Object -First 5
Start-Sleep 4
(Invoke-RestMethod http://localhost:3001/search/$($res.searchId)).refinement
```

Autocomplete: `Invoke-RestMethod "http://localhost:3001/geocode/autocomplete?q=piazza%20duomo%20milano"`.

**Senza chiavi Mapbox:** lasciando vuoto `MAPBOX_SERVER_TOKEN` il backend usa `FixtureGeocodingProvider` (una decina di luoghi noti: "milano centrale", "bologna", "roma termini"…) e `MockRoutingProvider` (percorsi rettilinei, non strade reali). La pipeline funziona identica, i valori di deviazione no.

## Prezzi: da dove arrivano e quanto sono freschi

- **Anagrafica** (indirizzi, gestore, tipo di impianto): file CSV MIMIT, caricato con `pnpm ingest`.
- **Prezzi**: il CSV MIMIT è pubblicato ogni mattina ma contiene per costruzione lo stato *alle 8 del giorno precedente* (1–2 giorni di ritardo). Per questo, prima di ogni ricerca, l'API aggiorna in tempo reale i prezzi delle zone attraversate dal percorso interrogando il **sito ufficiale Osservaprezzi** (`carburanti.mise.gov.it`), a riquadri di ~14 km con cache di 60 minuti condivisa tra le ricerche.
- La risposta di `POST /search` include `livePrices` (`live`, `partial`, `unavailable`, `disabled`) e la UI dichiara quale fonte sta usando. Se il sito ufficiale non risponde la ricerca funziona comunque con il CSV.
- **Attenzione:** l'endpoint del sito non è un'API pubblica documentata e ha un limite di richieste (risponde `429`). Il client è volutamente prudente (3 chiamate in parallelo, tetto di 40 riquadri per ricerca, pausa automatica su 429). Non alzare i limiti senza motivo; vedi `docs/OPEN_QUESTIONS.md` (punto 7). `LIVE_PRICES_PROVIDER=off` in `apps/api/.env` la disattiva.
- La prima ricerca in una zona nuova può richiedere alcuni secondi in più (fino a ~10 s su percorsi lunghi, con copertura parziale dichiarata); le successive nella stessa zona sono immediate.

## Test

| Comando | Cosa esegue | Richiede |
|---|---|---|
| `pnpm test` | 120 test di `packages/core` + 159 di `apps/api` (provider, prezzi live, ricerca, kill switch, rate limit, rotte HTTP) + 75 di `apps/web` | niente: zero rete, zero database |
| `pnpm --filter @routefuel/web test` | Solo i 75 test del frontend (ordinamento e filtri, deep-link, anti-sovrapposizione dei pin, schermata Risultati, banner, rotte). La mappa reale (WebGL) non gira in jsdom ed è sostituita da uno stub | niente |
| `pnpm test:db` | 18 test di integrazione su PostgreSQL/PostGIS reale (corridoio, freschezza dei prezzi, mediana nazionale, contatore, aggiornamento prezzi live) | `docker compose up -d`, `pnpm db:migrate`, `pnpm ingest` |
| `pnpm typecheck` | type-check di tutti i pacchetti (test inclusi) | niente |

## Risoluzione problemi

- **`autenticazione con password fallita per l'utente "routefuel"`**: sulla porta 5432 c'è probabilmente un PostgreSQL nativo (servizio Windows `postgresql-x64-XX`). Il container espone Postgres sulla **5433**: controlla che `DATABASE_URL` in `apps/api/.env` usi quella porta.
- **`docker` non riconosciuto nel terminale**: dopo l'installazione di Docker Desktop chiudi *tutte* le finestre di VS Code (e l'app da cui l'hai avviato) e riaprile, così ereditano il PATH aggiornato.
- **Docker Desktop su Windows non parte**: servono BIOS con virtualizzazione attiva e le funzionalità Windows "Sottosistema Windows per Linux" e "Piattaforma macchina virtuale" (poi riavvio). Se compare `wsl-keepalive failed to start`, vedi i log in `%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`.
- **Autocomplete con "Suggerimenti non disponibili"**: quasi sempre CORS (stai usando `127.0.0.1` invece di `localhost`) oppure l'API non è avviata.
- **`429 RATE_LIMITED`**: hai superato 20 ricerche/minuto (o 120 richieste di geocoding/minuto) dallo stesso IP; i limiti si cambiano in `apps/api/.env`.
- **La schermata Risultati mostra «Mappa non disponibile»**: manca `VITE_MAPBOX_PUBLIC_TOKEN` in `apps/web/.env` (o non hai riavviato `pnpm dev:web`), oppure il token non è autorizzato per `http://localhost:5173/` (restrizione URL). L'elenco funziona comunque.
- **Nei risultati compare «Prezzi in tempo reale non raggiungibili» o «su N zone su M»**: il sito ufficiale non ha risposto, ha risposto `429` (troppe richieste: l'API fa una pausa automatica di ~1 minuto) oppure il percorso è molto lungo (tetto di 40 riquadri per ricerca). Riprova dopo qualche minuto: i riquadri già scaricati restano in cache.
- **Un prezzo sembra assurdo (es. 1,000 €/L)**: di solito è un segnaposto inserito dal gestore. Benzina e gasolio sotto 1,2 €/L vengono scartati e il prodotto base ha la precedenza sulle varianti premium; se ne trovi altri, segnalali.
- **`503 BUDGET_EXHAUSTED`**: il contatore mensile delle chiamate Directions ha raggiunto `DIRECTIONS_HARD_LIMIT`. Il contatore è nella tabella `api_usage`.

## Comandi utili

| Comando | Effetto |
|---|---|
| `pnpm install` | Installa le dipendenze di tutto il monorepo |
| `pnpm dev:web` / `pnpm dev:api` | Avvia frontend (Vite) / backend (Fastify, con reload) |
| `pnpm db:migrate` | Applica le migrazioni Kysely (ogni nuova migrazione va registrata in `apps/api/src/db/migrate.ts`) |
| `pnpm ingest` | Scarica e normalizza i CSV MIMIT reali, upsert in DB |
| `pnpm build` | Build di produzione dei pacchetti che la prevedono |
| `docker compose up -d` / `down` | Avvia / ferma PostgreSQL + PostGIS (`down -v` azzera anche i dati) |

## Note

- Nessun segreto è hardcoded: tutte le chiavi/URL sensibili passano da variabili d'ambiente (vedi `.env.example`).
- Mapbox non ha un tetto di spesa nativo: i limiti su `/search` e `/geocode` e il kill switch sulle chiamate Directions sono l'unica protezione. Non rimuoverli.
- L'endpoint `POST /ingest` non ha autenticazione (fuori scope MVP, vedi `docs/PRD.md` §4.1): da non esporre pubblicamente senza protezione.
- Il testo digitato negli indirizzi passa dal backend ma non viene mai scritto nei log.
- Remote GitHub: `origin` → `https://github.com/DidyMond/RouteFuel.git`. Una branch per milestone (`feat/milestone-N-…`), integrata in `main` dopo la revisione.
