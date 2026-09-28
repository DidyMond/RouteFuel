# RouteFuel

Webapp (PWA) che trova il distributore di carburante più conveniente **lungo** un percorso A→B — non nel raggio attorno a un punto — considerando la deviazione reale (km/minuti extra) e il risparmio netto rispetto alla media della tratta. Fonte dati ufficiale: [MIMIT OpenData (Osservaprezzi carburanti)](https://www.mimit.gov.it/it/open-data/elenco-dataset/carburanti-prezzi-praticati-e-anagrafica-degli-impianti).

Documentazione di prodotto e architettura: [`docs/PRD.md`](docs/PRD.md), [`docs/PLAN.md`](docs/PLAN.md), [`docs/STACK_DECISION.md`](docs/STACK_DECISION.md), [`docs/OPEN_QUESTIONS.md`](docs/OPEN_QUESTIONS.md). Design system: [`DESIGN.md`](DESIGN.md).

Stato attuale: **Milestone 0 — Vertical Slice** (ingestione dati reali funzionante, healthcheck, homepage statica). Nessuna logica di ricerca/risparmio ancora implementata (Milestone 1).

## Struttura del repository

Monorepo pnpm:

```
apps/
  web/     Frontend — Vite + React + TypeScript + Tailwind CSS
  api/     Backend — Fastify + TypeScript, ingestione MIMIT, Kysely/PostgreSQL+PostGIS
packages/
  core/    Logica pura (parsing CSV, normalizzazione carburanti, validazioni) — zero I/O, zero rete
  shared/  Tipi TypeScript condivisi tra web/api/core
docs/      PRD, piano, decisione stack, domande aperte
mockup/    Riferimento visivo/UX (non codice da portare over)
assets/    Logo ufficiale
```

## Prerequisiti

- Node.js ≥ 20
- pnpm ≥ 9 (se non installato: `corepack enable && corepack prepare pnpm@9 --activate`, oppure eseguire i comandi sotto con `npx pnpm@9 ...`)
- Docker Desktop (per PostgreSQL + PostGIS in locale)

## Setup locale — passo per passo

1. **Installare le dipendenze** (dalla root del repo):

   ```bash
   pnpm install
   ```

2. **Copiare le variabili d'ambiente**:

   ```bash
   cp .env.example .env
   cp .env.example apps/api/.env
   ```

   I valori di default in `.env.example` bastano per lo sviluppo locale (nessuna chiave Mapbox è necessaria in questa milestone: verrà usata dalla Milestone 1 in poi).

3. **Avviare PostgreSQL + PostGIS**:

   ```bash
   docker compose up -d
   ```

4. **Eseguire le migrazioni del database**:

   ```bash
   pnpm db:migrate
   ```

5. **Lanciare l'ingestione dei due CSV MIMIT reali** (scarica, normalizza, fa upsert in DB — richiede connessione internet):

   ```bash
   pnpm ingest
   ```

   In alternativa, con l'API già in esecuzione (punto 7), è possibile innescare la stessa ingestione via HTTP:

   ```bash
   curl -X POST http://localhost:3001/ingest
   ```

   Rilanciare l'ingestione (da CLI o da HTTP) è idempotente: non duplica righe.

6. **Eseguire i test automatici** (parsing CSV e normalizzazione carburanti, zero rete/zero DB):

   ```bash
   pnpm test
   ```

7. **Avviare backend e frontend** (in due terminali separati):

   ```bash
   pnpm dev:api
   pnpm dev:web
   ```

   - API su http://localhost:3001 (`GET /health` per verificare stato server + DB)
   - Frontend su http://localhost:5173

## Comandi utili

| Comando | Effetto |
|---|---|
| `pnpm install` | Installa le dipendenze di tutto il monorepo |
| `pnpm dev:web` | Avvia il frontend (Vite) |
| `pnpm dev:api` | Avvia il backend (Fastify, con reload automatico) |
| `pnpm db:migrate` | Applica le migrazioni Kysely al database |
| `pnpm ingest` | Scarica e normalizza i CSV MIMIT reali, upsert in DB |
| `pnpm test` | Esegue i test automatici (attualmente in `packages/core`) |
| `pnpm typecheck` | Type-check di tutti i pacchetti del monorepo |
| `pnpm build` | Build di produzione di tutti i pacchetti che lo prevedono |
| `docker compose up -d` | Avvia PostgreSQL + PostGIS in locale |
| `docker compose down` | Ferma i servizi Docker (aggiungere `-v` per azzerare anche i dati) |

## Note

- Nessun segreto è hardcoded: tutte le chiavi/URL sensibili passano da variabili d'ambiente (vedi `.env.example`).
- L'endpoint `POST /ingest` non ha autenticazione (fuori scope MVP, vedi `docs/PRD.md` §4.1): da non esporre pubblicamente senza protezione.
- Il repository GitHub remoto è già configurato (`origin` → `https://github.com/DidyMond/RouteFuel.git`).
