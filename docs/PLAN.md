# Plan — Milestone Implementative RouteFuel

Stack di riferimento: vedi `STACK_DECISION.md` (confermato). Scope e decisioni prodotto: vedi `PRD.md`. Domande bloccanti: vedi `OPEN_QUESTIONS.md`.

Metodo: una milestone alla volta, riepilogo delle modifiche a fine milestone, nessuna interpretazione libera di ambiguità (→ `OPEN_QUESTIONS.md`).

---

## Milestone 0 — Vertical Slice ✅ completata e validata in locale (28/09/2026)

Obiettivo: dimostrare che l'intera catena (scaffold → ingestione dati reali → DB → API → frontend con design system) funziona end-to-end, senza ancora logica di ricerca/risparmio.

**Contenuto:**
- Scaffold monorepo pnpm (`apps/web`, `apps/api`, `packages/core`, `packages/shared`).
- `docker-compose.yml`: PostgreSQL 16 + PostGIS per sviluppo locale.
- `FuelDataProvider`: interfaccia + implementazione MIMIT (download + parse pipe-delimited + upsert) + implementazione fixture (per test, zero rete).
- Migrazione DB: tabelle `stations` (anagrafica, con colonna `geography(Point)`, `tipo_impianto` enum `stradale|autostradale`), `fuel_prices` (prezzi, FK su station, colonne `raw_desc_carburante` + `fuel_type_normalizzato` enum, `updated_at`).
- Job/endpoint di ingestione manuale che scarica i 2 CSV reali, normalizza e fa upsert, con le seguenti regole di parsing/qualità dati (verificate sui file reali):
  - Il file ha **due righe di intestazione**, non una: riga 1 = metadata (`Estrazione del ...`), riga 2 = header colonne — entrambe da saltare, non solo la prima.
  - **Bug di parsing reale scoperto**: in ~20 righe di `anagrafica_impianti_attivi.csv` il campo `Nome Impianto` contiene un carattere `|` letterale (es. `STOIL SIMPLE | gestori.prezzibenzina.it`), che rompe uno split posizionale ingenuo spostando tutte le colonne successive. **Regola robusta**: prendere sempre i primi 4 campi da sinistra (`idImpianto`, `Gestore`, `Bandiera`, `Tipo Impianto`) e gli ultimi 5 da destra (`Indirizzo`, `Comune`, `Provincia`, `Latitudine`, `Longitudine`); qualunque campo residuo nel mezzo è `Nome Impianto` (ri-unito con spazio se spezzato in più pezzi). Mai fare `split('|')[8]`/`[9]` per lat/lon.
  - Stazioni con coordinate mancanti o non numeriche (verificate: 3 righe su ~24.000) → escluse da ogni tabella/query geospaziale, loggate.
  - Coordinate fuori dal bounding box Italia (`lat` 35–47.5, `lon` 6.5–19`) → trattate come invalide, stesse regole sopra (nessuna riga anomala di questo tipo trovata nel campione verificato, ma il controllo va comunque implementato).
  - Prezzi mancanti/zero (verificata 1 riga) → esclusa la singola riga di prezzo, non l'intera stazione.
  - Upsert prezzi per `idImpianto + fuel_type_normalizzato + isSelf`, tenendo il più recente per `dtComu` (nel file di un singolo giorno non risultano duplicati esatti, ma la regola serve per l'idempotenza tra ingestioni giornaliere successive).
  - Valori di prezzo fuori range plausibile (es. < €0.30/L o > €5/L) esclusi dal calcolo e loggati come anomalia, mai accettati silenziosamente.
- Normalizzazione `descCarburante` → `fuel_type_normalizzato`: preprocessing (`trim`, `lowercase`, rimozione accenti, spazi multipli collassati) prima del match contro una tabella di mapping statica con questi bucket: `benzina`, `diesel`, `gpl`, `metano`, `hvo` (famiglia biocarburanti/HVO, esclusa dalla UI MVP ma conservata), `other` (es. `GNL`, `L-GNC`), `unknown` (valori non riconosciuti, es. `F-101`, `E-DIESEL` — mai indovinati, solo loggati). Test unitari eseguiti sull'elenco reale delle ~60 varianti osservate nel CSV live, incluso un caso esplicito per un valore sconosciuto → `unknown` + warning, mai un crash.
- Endpoint `GET /health` (stato API + connessione DB).
- Homepage (`apps/web`) con header (logo+wordmark, avatar) e search bar grande, fedeli ai token di `DESIGN.md` — **nessuna logica di ricerca reale**, solo UI statica.
- `.env.example`, `README.md` con setup locale, `.gitignore`.
- Repo Git inizializzato con commit iniziale; istruzioni push su GitHub.

**Criteri di accettazione:**
- [x] `docker compose up` avvia Postgres+PostGIS localmente senza errori.
- [x] Eseguendo l'ingestione, il DB contiene stazioni con coordinate valide e prezzi collegati (verificabile con una query di conteggio).
- [x] Le ~20 righe con `|` letterale nel nome impianto vengono parsate correttamente (coordinate e id corretti, verificabile puntualmente sugli id noti trovati in fase di analisi).
- [x] Rilanciare l'ingestione due volte non duplica righe (idempotenza).
- [x] `GET /health` risponde 200 con stato DB.
- [x] `pnpm dev` avvia frontend che mostra header + search bar coerenti con `DESIGN.md` (colori, font, radii, nessun colore/raggio fuori palette).
- [x] Nessun segreto hardcodato nel codice; tutte le chiavi passano da variabili d'ambiente.
- [x] Test automatici sulla normalizzazione CSV → entità DB, eseguiti su fixture locali (zero chiamate di rete nei test), incluso il fixture con il bug del `|` nel nome impianto e con righe a coordinate mancanti/anomale.


**Affinamenti emersi in implementazione e validazione:**
- **Normalizzazione:** `E-DIESEL` non è "unknown": contiene la parola "diesel" e viene classificato `diesel` dalla regola euristica di ripiego (dizionario esplicito prima, parole chiave dopo, "unknown" solo se nulla combacia: restano `F-101`/`F101`, 48 righe). `HiQ Perform+` è diesel premium; solo `HiQ Perform B100 Ottani` è biocarburante (`hvo`).
- **Dedupe prezzi:** entro un singolo batch, varianti diverse che normalizzano sullo stesso (stazione, carburante, modalità) — es. "Gasolio" e "Gasolio Premium" — si riducono al **prezzo più basso** (a parità, la comunicazione più recente); tra ingestioni giornaliere successive vince sempre il dato del giorno (upsert). Sul dataset reale: 92.778 righe valide → ~79.000 dopo il dedupe.
- **Dati reali (26–28/09/2026):** 23.995 stazioni valide su 23.998 (3 senza coordinate), `Tipo Impianto` = `Stradale` (~23.450) / `Autostradale` (543). Nessuna riga anomala per coordinate fuori dai confini né duplicati esatti nel file di un giorno.
- **Windows / ambiente locale:** Postgres esposto sulla porta **5433** (5432 spesso occupata da un PostgreSQL nativo); le migrazioni usano un provider con import statici perché `FileMigrationProvider` fallisce su Windows (`ERR_UNSUPPORTED_ESM_URL_SCHEME`); pnpm 12.
- **Da ricordare:** ogni nuova migrazione va registrata in `apps/api/src/db/migrate.ts`.

---

## Milestone 1 — Ricerca A→B e calcolo core ✅ confermata e integrata in `main` (29/09/2026)

Branch: `feat/milestone-1-search`. Per ogni milestone si lavora su un branch dedicato e si integra in `main` solo dopo la revisione (come per M0).

**Contenuto (come implementato):**
- `packages/core` (logica pura, zero I/O, **120 test**):
  - `computeNetSavings` / `costPerKm`: formula `S_net`, con `C_km = P_avg / consumo_km_per_litro` (solo costo carburante, calcolato su `P_avg` e non su `P_station`).
  - `computeReferencePrice`: cascata `P_avg` a 3 livelli, per combinazione (`fuel_type`, modalità): (1) mediana delle stazioni "on-route" con distanza laterale one-way ≤ 0.5 km (costante fissa `ON_ROUTE_THRESHOLD_KM`, inclusiva, indipendente dallo slider); (2) se il campione è < `N_MIN = 3`, mediana di tutto il corridoio (raggio = deviazione massima); (3) se ancora < 3, mediana nazionale. Restituisce `null` solo se nessun livello ha dati.
  - `selectStationPrice`: logica Self/Servito. "Solo Self" attivo → conta solo chi ha il Self; disattivo → Self se presente, altrimenti Servito con flag `servitoOnly` (badge "Solo servito"). Mai una media dei due.
  - `geo/route`: `simplifyRoute` (Douglas-Peucker, ~50 m), `routeToWkt`, `createRouteProjector` (distanza laterale e posizione lungo il tracciato di ogni stazione).
  - `geo/tiles`: griglia di riquadri da 14 km (`tileForPoint`, `tilesCoveringRoute`) per l'aggiornamento dei prezzi live; `fuel/liveStationPrices`: conversione dei prezzi live nello stesso formato normalizzato del CSV.
  - `geo/detour`: `estimateProxyDetour` (2 × distanza laterale × 1.25 di tortuosità stradale, a 40 km/h) e `computeRoutedDetour` (`A→S→B` meno `A→B`, mai negativa).
- **Tre semantiche di deviazione, esplicite e distinte:** `on_route_threshold_km` (0.5 km one-way, fisso, solo per il livello 1 di `P_avg`) ≠ raggio del corridoio (one-way, = deviazione massima, minimo 1 km e massimo 15 km, pre-filtro PostGIS e campione del livello 2) ≠ `maxDetourKm` (round-trip: km extra reali di `A→stazione→B`, criterio finale di esclusione, stesso significato di `D_detour` nella formula).
- `apps/api`:
  - `GeocodingProvider`: interfaccia + `FixtureGeocodingProvider` + `MapboxGeocodingProvider` (Geocoding **API v6**, non Search Box), esposto con `GET /geocode/autocomplete` e `GET /geocode/reverse`.
  - `RoutingProvider`: interfaccia + `MockRoutingProvider` + `MapboxRoutingProvider` (profilo `mapbox/driving`), con decoratori componibili `BudgetedRoutingProvider` (kill switch) e `CachedRoutingProvider` (TTL 10 minuti, deduplica delle richieste in corso, gli errori non si memorizzano).
  - `POST /search` (validazione Zod, default confermati): percorso A→B, corridoio PostGIS, prezzo di riferimento, ranking proxy **immediato**; risponde con `searchId`. In background verifica con routing reale le prime `REFINE_TOP_N = 5` stazioni (e quelle che entrano in testa al loro posto, fino a 10 chiamate extra); il client legge l'esito con `GET /search/:id` (stato `pending | done | skipped | failed`). Stato in memoria (TTL 15 minuti, max 500 ricerche).
  - Corridoio: `ST_DWithin` su `geography` (sferico, indice GiST) con i prezzi già filtrati per freschezza (`maxPriceAgeHours`, default 72 h).
  - **Rate limiting per IP**: 20 richieste/minuto su `POST /search`, 120 su `GET /search/:id` e su `/geocode/*` (configurabili da env).
  - **Kill switch** sul contatore mensile Directions (tabella `api_usage`, mese UTC, persistente): oltre **80.000** (soglia soft) niente verifica con routing reale, solo proxy (`refinement: skipped`); oltre **98.000** (soglia hard) `503 BUDGET_EXHAUSTED`.
  - **Prezzi in tempo reale** (vedi decisione 12): il file CSV MIMIT ha 1–2 giorni di ritardo, quindi prima di leggere il corridoio si aggiornano i riquadri coperti dal percorso interrogando il sito ufficiale Osservaprezzi (`LivePriceProvider` → `OspzLivePriceProvider`), con cache per riquadro nel DB (`live_price_tiles`, TTL 60 min), concorrenza limitata, scadenza, circuit breaker e pausa su HTTP 429. Se la fonte non risponde la ricerca prosegue con il CSV e lo dichiara (`livePrices.status`).
  - Il testo digitato e le coordinate dell'utente **non compaiono nei log** (il serializer di richiesta scarta la query string).
- `apps/web`: Home trasformata in form di ricerca reale — due campi A/B collegati con autocomplete (debounce 350 ms, minimo 3 caratteri, bias di prossimità), "posizione attuale" con reverse geocoding non bloccante, scambio A/B, chip carburante, stepper litri (5–120), slider deviazione (1–10 km), consumo (3–40 km/L, con "Ripristina"), interruttore "Solo Self". Risultati come card semplici con riepilogo (percorso, prezzo di riferimento e livello, origine e freschezza dei prezzi (tempo reale / file giornaliero), stato della verifica) e aggiornamento automatico quando arriva il ricalcolo.

**Criteri di accettazione:**
- [x] Test unitari su `packages/core`: formula (positivo/negativo, deviazione zero, "paradosso della deviazione"), cascata `P_avg` sui 3 livelli (incluso il caso GPL/Metano a campione scarso), esempio a 5 stazioni, Self/Servito, geometria — zero chiamate esterne.
- [x] `MockRoutingProvider` e `FixtureGeocodingProvider` permettono di testare `/search` e `/geocode` senza rete né chiavi (159 test API, `app.inject`).
- [x] Percorso reale Milano→Bologna con dataset MIMIT completo: **0.7–1.2 s** per il ranking proxy; top-5 verificata in background. Misure aggiuntive: Milano→Napoli (774 km) 0.9 s; Palermo→Torino (1.590 km, 2.372 candidati) 1.1 s.
- [x] Kill switch verificato in test: soglia soft → `skipped` senza chiamate di verifica; soglia hard → nessuna chiamata al provider; il contatore riparte a ogni mese.
- [x] Home invia la ricerca reale e mostra i risultati come card (verificato nel browser con Mapbox reale).
- [x] Prezzi live verificati sul percorso Ceriano Laghetto → Lomazzo (4 riquadri): 1.7 s a freddo, 0.3 s con cache; la stazione 62820 passa da 2.129/2.349 (CSV) a **1.990/2.200** (sito ufficiale, stesso giorno). Milano→Bologna a freddo ~9 s per 37 riquadri (poi 1.2 s): vedi decisione 12.
- [x] Test di integrazione su PostgreSQL/PostGIS reale (18, `pnpm test:db`): raggio del corridoio, esclusione dei prezzi stantii, filtro per carburante, mediana nazionale, contatore concorrente senza aggiornamenti persi.

**Decisioni e affinamenti emersi in implementazione:**
1. **Geocoding tramite l'API (proxy), non browser→Mapbox diretto** come ipotizzato in `STACK_DECISION.md`: la specifica di M1 colloca il provider in `apps/api`. Conseguenze: in M1 serve **un solo token, lato server**; il browser non riceve alcuna chiave; niente restrizioni URL da gestire ora; provider fixture usabili in sviluppo. Contro: il backend vede in transito il testo digitato (mitigato: nessun log della query, rate limit dedicato). Rivalutabile in M2, quando entrerà in gioco il token del browser per la mappa.
2. **`ST_DWithin` senza `ST_Buffer` materializzato:** su `geography` `ST_DWithin` è l'equivalente esatto di "dentro il buffer" e usa l'indice GiST; costruire il poligono del buffer di un tracciato lungo è costoso e non aggiunge nulla.
3. **Proiezione stazioni ottimizzata:** turf `nearestPointOnLine` è O(vertici) per ogni stazione (misurato 9.9 s su 1.590 km / 2.372 stazioni). Ora una scansione planare sceglie il segmento e turf calcola la geodesia solo su quello: **1.1 s**, risultati equivalenti a turf "forza bruta" (test su 300 punti, tolleranza 1 m). A distanze molto grandi dal tracciato la posizione lungo la rotta può essere ambigua (quasi-parità tra due tratti): irrilevante nei corridoi ≤ 15 km.
4. **Il proxy sottostima spesso:** la stima geometrica ignora svincoli e complanari. Esempio reale su Milano→Bologna: una stazione stimata a 0.6 km risulta a 4.5 km col routing reale, e 3 delle prime 5 superavano davvero i 5 km (escluse dopo la verifica). Conferma il valore della strategia ibrida; le costanti del proxy (tortuosità 1.25, 40 km/h) restano ipotesi documentate da tarare. **Decisione (revisione di M2, 30/09/2026): verifica finché la testa ha 5 stazioni confermate** — dopo il primo giro sulle prime 5, ogni stazione ancora solo stimata che entra in testa viene verificata a sua volta, con un tetto di 10 chiamate extra per ricerca (`REFINE_EXTRA_CALLS_CAP`; al massimo 15 verifiche più 1 per il diretto). Oltre il tetto restano le stime con il badge «stima».
5. **Soglia hard aggiuntiva (98.000)** oltre alla soft richiesta (80.000): Mapbox non ha un tetto di spesa nativo e senza un limite duro il kill switch non impedirebbe superamenti del free tier.
6. **Stato di ricerca in memoria:** corretto per un singolo processo API (MVP); con più istanze servirà uno store condiviso (es. Redis).
7. **Esclusione dei prezzi stantii (72 h) già applicata in M1** (nella query SQL), perché è una decisione vincolante di prodotto e falserebbe il prezzo di riferimento; in M2 restano lo stato vuoto e il banner.
8. **Limite noto del geocoding v6:** trova indirizzi, vie e località ma non i punti di interesse (es. "Milano Centrale" restituisce il quartiere "Centrale"). Cercare per POI richiederebbe la Search Box API (500 sessioni/mese gratuite, poi a pagamento): decisione rimandata (→ `OPEN_QUESTIONS.md`).
9. **Header a vetro** (`surface/85` + blur) invece che trasparente: con risultati scorrevoli il contenuto passava sotto il logo.
10. `POST /search` risponde `pricesUpdatedAt` (fine dell'ultima ingestione riuscita), sempre mostrato in UI, come da decisione vincolante.
11. Fuori da M1, per scelta: mappa, bottom sheet, filtri di ordinamento, deep-link al navigatore, override di `P_avg`/`V_time` (Impostazioni, M4), preset Casa/Lavoro.
12. **Prezzi in tempo reale dal sito ufficiale (aggiunta dopo la prima revisione).** Il CSV `prezzo_alle_8.csv` contiene per costruzione lo stato "alle 8 del giorno precedente" (1–2 giorni di ritardo; verificato: file del 28/09 07:09 UTC → `Estrazione del 2026-09-27`) e mostrava 2.129/2.349 dove il sito dava 1.990/2.200. Il sito `carburanti.mise.gov.it/ospzSearch` usa `POST /ospzApi/search/zone` (punto + raggio ≤ 10 km, JSON, con data di comunicazione aggiornata a pochi minuti). Scelte:
    - **Anagrafica dal CSV** (indirizzi, gestore, tipo: stabili), **prezzi dal live**; il CSV resta fallback e base per le zone non ancora aggiornate. Il file giornaliero non sovrascrive mai un prezzo più recente (`communicated_at`).
    - **Riquadri di 14 km** interrogati con cerchio da 10 km e cache condivisa (TTL 60 min): la richiesta è per riquadro, non per ricerca, quindi il carico sul ministero cresce con le zone *distinte*, non con gli utenti. L'endpoint `/search/route` non basta (corridoio troppo stretto: 44 stazioni su 200 km).
    - **Limiti misurati:** HTTP 429 dopo ~80 richieste in pochi minuti con 6 in parallelo. Quindi: concorrenza 3, pausa immediata su 429 (rispettando `Retry-After`), al massimo 40 riquadri per ricerca, attesa massima 10 s (le richieste lente proseguono in background e scaldano la cache).
    - **Rischio:** non è un'API pubblica documentata, non ha SLA né licenza esplicita, e il formato può cambiare (già successo con `/OssPrezziSearch`). Mitigazioni: interfaccia `LivePriceProvider`, validazione Zod con scarto delle righe malformate, fallback al CSV, interruttore `LIVE_PRICES_PROVIDER=off`. Da chiarire con il ministero (→ `OPEN_QUESTIONS.md`, punto 7).
13. **Bug dei prezzi segnaposto (trovato verificando i prezzi live).** I gestori inseriscono a volte 1.000 €/L per un prodotto che non vendono (es. "Blue Super" a 1.000 nella stazione 3473, presente anche nel CSV) e la regola "tieni il prezzo più basso tra le varianti" lo trasformava nel prezzo della benzina, portando in testa alla classifica una stazione irreale. Correzione: (a) il **prodotto base** ("Benzina", "Gasolio", "GPL", "Metano") vince sulle varianti premium, tra varianti resta il prezzo più basso; (b) soglia minima di plausibilità di 1.2 €/L per benzina, gasolio e HVO (GPL e metano restano liberi). Nei dati reali erano ~50 righe su 79.000.

---

## Milestone 2 — Screen 2: Risultati & Mappa Distributori ✅ confermata e integrata in `main` (30/09/2026)

Branch: `feat/milestone-2-results-map`.

**Contenuto (come implementato):**
- **Mappa Mapbox GL JS** con il basemap **Standard** (tema `monochrome`, etichette in italiano, niente POI né 3D; stile sostituibile con `VITE_MAPBOX_STYLE_URL`, vedi la decisione 10), caricata in modo lazy (chunk separato: la Home resta leggera) e scaricata in anticipo mentre il server cerca. Token pubblico da `apps/web/.env` (`VITE_MAPBOX_PUBLIC_TOKEN`, mai committato); senza token o con token non valido compare «Mappa non disponibile» e resta l'elenco. Percorso come polyline `secondary` (#0284C7) con alone e tratteggio direzionale; partenza e arrivo; controlli zoom e «ricentra». Pin con il prezzo: **verde con «verificato» per la «Migliore»**, neutro per le altre, evidenza sulla selezionata; **anti-sovrapposizione** (`pickVisibleMarkers`: resta un solo pin per gruppo di vicini, i pin compaiono zoomando) e creazione dei soli pin visibili. Capsula in alto con tratta, km, durata e numero di stazioni.
- **Bottom sheet** (`rounded-t-3xl`, mappa al 40% dell'altezza, scorrimento solo nel foglio; maniglia per espandere/ridurre; su schermi larghi diventa barra laterale da 440 px sopra la mappa): ordinamento **Più conveniente / Minor deviazione** (km extra verificati, proxy se manca la verifica; spareggi: distanza laterale dal tracciato, ordine di incontro partendo da A, risparmio netto; logica e test in `packages/core`) e pill **Solo Self / Autostrada**, tutti **client-side, senza chiamate di rete**. Card: avatar con iniziali da `Bandiera`, nome e indirizzo, badge «Migliore», prezzo grande con cifre tabulari e «Benzina Self», deviazione (`~` se stima), risparmio, «Solo servito», **Info** e **Naviga**. Prezzo di riferimento con il livello di `P_avg`. Banner in fondo con fonte MIMIT, data del file giornaliero e stato dei prezzi in tempo reale (`live` / `partial` / `unavailable` / `disabled`). Prime 20 schede + «Mostra altre».
- **Percorso con sosta:** selezionando una stazione (scheda o pin) la mappa disegna A→stazione→B in verde `primary` (#059669) sopra la rotta diretta, che resta azzurra dove i due tracciati divergono. Nuovo endpoint `GET /search/:id/stations/:stationId/route` (stessa chiamata di routing della verifica: per le prime 5 stazioni è già in cache, per le altre costa una chiamata Directions, passa dal kill switch e dal rate limit). Se il routing non è disponibile nessun tracciato e resta il badge «stima». Un secondo tap sulla scheda o sul pin, o un tap sullo sfondo della mappa, deseleziona e rimuove il tracciato.
- **Deep-link navigatore** (`lib/navigation`): iOS → Apple Maps, Android → Google Maps, altrove menu con Google Maps, Apple Maps e Waze (anche da «Info»). Nessun Screen 3.
- **Navigazione**: rotte `/` e `/results` (react-router), barra inferiore «Cerca / Risultati» come da `DESIGN.md`; la Home resta montata così il form conserva i valori.
- **Backend:** unica modifica additiva, `route.geometry` nella risposta di `POST /search` (→ `OPEN_QUESTIONS.md`, «Decisioni risolte», punto 18). Logica di ricerca invariata.
- **Fuori da questa milestone, per scelta:** Screen 3 (dettaglio), Screen 5 (impostazioni), «Aperto ora» e altri elementi non derivabili dai dati MIMIT, layer traffico, stato vuoto «Mostra comunque (dati meno recenti)» (oggi l'errore `NO_PRICE_DATA` porta alla Home con il messaggio), lookup dei loghi ufficiali dei brand (per ora iniziali).

**Criteri di accettazione:**
- [x] Mappa mostra percorso e marker: verificato nel browser su Milano→Bologna con dati e Mapbox reali (216 km, 48 stazioni, «Migliore» in verde, pin non sovrapposti).
- [x] Cambiare filtro di ordinamento riordina la lista senza nuova chiamata rete: verificato nel browser (0 richieste alle API dopo tre cambi di ordinamento) e con test.
- [x] Il filtro «Autostrada» (ex «Autostrada & Extraurbane») filtra per `Tipo Impianto` (Milano→Bologna: 5 stazioni autostradali).
- [x] Bottom sheet scorrevole indipendentemente dalla mappa: verificato (con lo scroll del foglio la mappa non si muove, `scrollY` della pagina = 0).
- [x] Timestamp del file MIMIT e stato dei prezzi live sempre visibili nel banner.
- [x] Nessun errore in console (flusso completo Home → ricerca → Risultati con Chrome).
- [~] **Lighthouse (mobile, throttling simulato):** Home **99** (misura singola) / **91** (dentro il flusso); accessibilità Risultati 92, best practices 100. La ricerca con apertura dei Risultati (timespan) segna **76–79**, poco sotto 80: il costo è dominato da Mapbox GL (chunk da 533 kB gzip) e dal WebGL in software di Chrome headless; TBT 440–500 ms con CPU rallentata 4×. Ottimizzazioni fatte: chunk lazy con prefetch, solo i pin visibili, 20 schede iniziali. Non è misurabile con una navigazione classica perché `/results` richiede lo stato di una ricerca.
- [x] Test a fine milestone: core 139, api 175, web 97 (web: ordinamento e filtri, deep-link, anti-sovrapposizione, rendering di schermata e card, percorso con sosta, stile della mappa, banner, foglio Info, rotte); niente e2e.

**Decisioni e affinamenti emersi in implementazione** (le interpretazioni provvisorie, ora tutte chiuse, sono in `OPEN_QUESTIONS.md`, «Decisioni risolte», punti 12–25):
1. `vite-plugin-env` non serve: Vite espone già le variabili `VITE_*`.
2. Il CSS di Mapbox imposta `position: relative` sul contenitore e vinceva sulla classe `absolute` di Tailwind (mappa alta 0 px): il contenitore usa `w-full h-full`.
3. Il foglio «Apri in navigatore» è un portale su `body`: dentro il contenitore fisso restava sotto la barra di navigazione.
4. `index.html`: rimosso `user-scalable=no` (blocca lo zoom, segnalato da Lighthouse); etichetta accessibile del pulsante profilo allineata al testo visibile.
5. **Contrasto WCAG (revisione):** il testo piccolo (<14px) su sfondo chiaro usa `text-on-primary-fixed-variant` invece di `text-primary`; regola aggiunta a `DESIGN.md`. Restano testo a 14px, bianco su `bg-primary` e azzurro `secondary` (poi chiusi: decisione 11 e punto 21 delle «Decisioni risolte»).
6. **Revisione di M2:** pill rinominata «Autostrada»; decisioni su input e colori confermate (punti 1 e 2).
7. **Bug deviazione «+0,0 km (+3 min)» (revisione funzionale).** Causa radice: il percorso diretto del provider è il più *veloce*, non il più corto. Sul percorso di test (Ceriano Laghetto → Lomazzo) il diretto passa dall'A9 (15,49 km, 17,6 min) mentre A→«1858 Bregnano»→B usa strade locali (12,94 km, 20,6 min): −2,55 km ma +2,93 min. `computeRoutedDetour` applicava `max(0, ·)` separatamente a km e minuti, quindi risultava «+0,0 km» con i minuti intatti, per una stazione a 0,8 km dal tracciato. Lo stesso zero compariva per altre due stazioni verificate e faceva coincidere «Minor deviazione» con «Più conveniente» (pareggio sui km → ordine per risparmio): non era un difetto del cablaggio. Correzione in `packages/core`: i km verificati non scendono sotto il minimo fisico `2 × distanza laterale`, e i minuti non superano i km extra alla velocità minima di 10 km/h (minimo 1 min): una deviazione di ~0 km non può costare minuti, una stazione fuori dal tracciato non ha mai «+0,0 km». Resta il valore verificato se disponibile, altrimenti il proxy con «~». Regressioni in `packages/core` (distanza laterale > 0 ⇒ km > 0; km ≈ 0 ⇒ minuti ≤ 1; combinazioni di km/minuti grezzi), in `apps/api` (caso reale) e nel web (card verificata vs proxy). → `OPEN_QUESTIONS.md`, «Decisioni risolte», punto 22 (regola confermata).
8. **Ordinamenti: «Sul percorso» rimosso (decisione del product owner).** Restano «Più conveniente» e «Minor deviazione». Per «Minor deviazione»: `detourKm` verificato crescente (proxy se manca), spareggio per distanza laterale crescente, poi ordine di incontro (`alongRouteKm`), poi risparmio netto. Il terzo ordinamento «Miglior tempo» del mockup 2 è in backlog M7, da valutare con dati d'uso reali.
9. **Percorso con sosta** (vedi sopra): endpoint on-demand riusabile da Screen 3 (M3), che qui ottiene così la deviazione verificata di *qualunque* stazione.
10. **Stile mappa.** Basemap **Mapbox Standard**, tema **`monochrome`**, scelto su `faded` per il contrasto con i nostri overlay: blu #0284C7 (rotta diretta) e verde #059669 (rotta con sosta, pin «Migliore»). `faded` conserva prati verdi e acqua azzurra desaturati: nel confronto sullo stesso percorso la polilinea verde si confondeva con i prati e l'azzurro con i corsi d'acqua; `monochrome` è fatto di soli grigi, quindi i due overlay restano distinguibili ovunque. Etichette in italiano: Standard **non ha** una config `language` (il suo schema ha `theme`, `lightPreset`, `show…Labels`, `color…`, `font`…), si usa l'opzione `language: "it"` di `mapboxgl.Map` (GL JS ≥ 3.10, installato 3.31). Disattivati POI, trasporto pubblico, strade pedonali e 3D (meno rumore sotto i pin, meno lavoro per la GPU); i nostri livelli stanno nello slot `middle` (sopra le strade, sotto le etichette). **`VITE_MAPBOX_STYLE_URL`** (opzionale, `mapbox://styles/utente/id`): se presente e valido sostituisce lo stile senza toccare il codice (con uno stile personalizzato non si applicano `config` e slot); un valore non valido ricade sul default. Nessuno stile creato via Styles API e nessuno scope `styles:*` richiesto ai token.
11. **Contrasto esteso a «≤14px»** (approvato): `text-primary` → `text-on-primary-fixed-variant`, `text-secondary` → `text-on-secondary-fixed-variant` sul testo piccolo, e indirizzo e «Benzina Self» delle card da `text-outline` a `text-on-surface-variant`; regola in `DESIGN.md`. Resta accettato, e tracciato in M7, il testo bianco su `bg-primary`. Un test impedisce i tre colori deboli su testo ≤14px.

---
## Milestone 3 — Screen 3: Dettaglio Stazione ✅ confermata e integrata in `main` (01/10/2026, tag `m3`)

Branch: `feat/milestone-3-station-detail`.

**Contenuto (come implementato):**
- **Rotta** `/station/:searchId/:stationId` (`StationDetailScreen`). Si apre da Screen 2 **solo** con il pulsante **Info**; funziona anche con un indirizzo diretto, finché la ricerca è viva sul server (TTL 15 minuti). Header a pila (indietro, brand centrato, salva, condividi, avatar) con safe-area; nessuna barra inferiore.
- **Meta stazione:** iniziali del brand (da `Bandiera`), nome, indirizzo completo con **Copia** (Clipboard API, con riserva `execCommand`). Sotto l'indirizzo una riga: pill del tipo di impianto («Stradale»/«Autostrada») a sinistra, «Gestore …» a destra con `truncate` (e tooltip con il testo intero). Nessun badge sulla provenienza dei dati in questo riquadro.
- **Impatto sul tuo viaggio** (bento a 3 tile): deviazione (`+X,X km` / `+Y min guida`, con `~` se proxy) con la micro-etichetta di provenienza sempre presente — **«Percorso verificato»** (routing Mapbox) oppure **«Stima geometrica»**, ciascuna con tooltip —, risparmio netto su `V_refill` litri («Non conviene» se ≤ 0) e differenziale vs media in €/L e in %. Sotto: prezzo di riferimento con il suo livello e risparmio lordo − costo della deviazione.
- **Listino carburanti:** una tile per ogni combinazione carburante × modalità con prezzo recente (benzina, diesel, GPL, metano; Self/Servito), con la combinazione scelta in ricerca evidenziata. Nell'header il badge verde **«Verificato MISE»** attribuisce i prezzi alla fonte ufficiale (Osservaprezzi): non riguarda la deviazione.
- **CTA flottante «Apri nel Navigatore»** con sfocatura progressiva e safe-area: apre **sempre** il menu «Apri in navigatore» (nessun pulsante secondario), con l'app predefinita del sistema rilevato in prima posizione ed etichettata **«Consigliato»** (iOS → Apple Maps, Android → Google Maps) e le altre sotto (Google Maps, Apple Maps, Waze); su desktop nessuna è consigliata. Un tap sul consigliato equivale al lancio diretto (stesso link https). **Salva** (localStorage) e **Condividi** (Web Share API, con copia negli appunti come riserva).
- **Rimossi, senza placeholder:** pill uscita autostradale, badge «Aperto ora/24-7», griglia servizi, telefono, numero pompe, «SCELTA OTTIMALE» e «Segnala prezzo errato» del mockup (non derivabili dai dati o fuori scope). Un test verifica l'assenza di queste sezioni nel markup.
- **Backend:** nuovo `GET /search/:id/stations/:stationId` (contratto `StationDetailResponse` in `packages/shared`): stazione, combinazione scelta, tutti i prezzi, litri, riferimento, deviazione con `source`, impatto e posizione. Se la stazione è già stata verificata dal ricalcolo in background riusa quel valore (nessuna chiamata); altrimenti **una** chiamata Directions on-demand (cache, kill switch, rate limit 30/min); se il routing non è disponibile risponde comunque 200 con la stima e `source: "proxy"`. Nuovo `getStationPrices` nel repository (PostGIS e test). In `packages/core`: `computeStationDetail` e `resolveDetour`.
- **Screen 2 (modifica minima richiesta):** il tap sulla scheda **seleziona** come in M2 (pin evidenziato e percorso con sosta verde, secondo tap deseleziona) e non naviga; il dettaglio si apre solo da **Info**. Il menu «Apri in navigatore» resta dietro «Naviga» su desktop. I Risultati restano montati (nascosti) durante il dettaglio: tornando indietro ordinamento, filtri, selezione e scorrimento sono quelli di prima, e la mappa riceve `resize()` e viene reinquadrata sul percorso (`fitBounds`) non appena il contenitore torna visibile.

**Criteri di accettazione:**
- [x] Screen 3 mostra una deviazione verificata col routing reale («Percorso verificato») o, se il routing non è disponibile, «Stima geometrica» esplicito nel tile della deviazione, mai una stima presentata come verificata (test API e web; verificato nel browser con una stazione fuori dalle prime 5: +2,6 km / +4 min on-demand).
- [x] Nessun dato inventato: ogni campo è una colonna dei CSV MIMIT (nome, bandiera, gestore, indirizzo, comune, provincia, tipo impianto, prezzi, data) o un calcolo di `packages/core` (deviazione, risparmio, differenziale).
- [x] «Apri nel Navigatore» apre sempre il menu, con l'app del sistema «Consigliata» in prima posizione e le coordinate della stazione in ogni link (test con user agent simulati).
- [x] Nessuna sezione per uscita autostradale, orari, servizi, telefono o numero di pompe nel markup (test).
- [x] Salva e Condividi funzionano (localStorage con riserva in memoria; Web Share API con riserva di copia).
- [x] Indietro torna a `/results` con ricerca, ordinamento, filtri e selezione preservati, e con la mappa ricentrata sul percorso (test di integrazione e con mappa finta; verificato nel browser: partenza e arrivo sugli stessi pixel di prima, anche dopo uno zoom).
- [x] Typecheck pulito; test a fine milestone: core 152, api 187 (+21 sul database), web 168.

**Decisioni e affinamenti emersi in implementazione** (le interpretazioni emerse sono chiuse in `OPEN_QUESTIONS.md`, «Decisioni risolte», punti M3·12–15):
1. **Attribuzioni distinte (revisione):** il badge **«Verificato MISE»** sta nell'header del listino e attribuisce i **prezzi** alla fonte ufficiale; la verifica del **percorso** è di Mapbox e si legge nel tile della deviazione («Percorso verificato» / «Stima geometrica», con tooltip). Il contratto API usa `detourSource = "routing" | "proxy"` (non `"verified"`).
2. **Deep-link: menu esplicito sempre raggiungibile con default consigliato** (invece di lancio diretto + menu secondario). Restano i link universali https di M2 (Apple Maps e Google Maps aprono comunque l'app se installata); `comgooglemaps://` è lo schema di Google Maps su iOS e non funziona su Android, `maps://` non aggiunge nulla.
3. **Matrice prezzi:** solo i quattro carburanti dell'MVP e i prezzi più recenti della soglia di freschezza della ricerca (come in Screen 2); HVO e «altro» non compaiono.
4. **Iniziali del brand:** nessuna tabella di loghi (come in M2); resta in M7.
5. **Un bug trovato solo nel browser reale:** due `useEffect` con corpo a espressione restituivano il valore di `scrollTo`/`setSaved` e React lo trattava come funzione di pulizia (schermata bianca); corretti e coperti da un test.
6. **Mappa al ritorno dal dettaglio (revisione):** i Risultati restano montati ma nascosti (`display: none`), quindi il contenitore della mappa misura 0 px. Il `ResizeObserver` di `MapCanvas` ora, quando il contenitore torna visibile, chiama `map.resize()` e riapplica `fitBounds` sui bounds del percorso (a ogni ritorno, non solo il primo); un semplice ridimensionamento a contenitore visibile fa solo `resize()`. Nota: il ritorno reinquadra sempre il percorso, anche se prima si era fatto zoom o spostata la mappa.

---

## Milestone 4 — Screen 5: Impostazioni & Veicolo ✅ implementata (in revisione)

Branch: `feat/milestone-4-settings`. Dopo la prima consegna il product owner ha chiesto la revisione funzionale descritta in «Revisione PO (02/10/2026)» e il giro di chiusura in «Chiusura M4 (03/10/2026)» qui sotto; il contenuto che segue è lo stato attuale.

**Contenuto (come implementato):**
- **Screen 5** (`/settings`, `SettingsScreen`) con quattro accordion, **tutti chiusi al caricamento** (il contenuto resta montato da chiuso; chevron e `aria-expanded` sono coerenti):
  - **Profilo Veicolo:** carrozzeria (Berlina, SUV, Wagon, Moto, Furgone), modello (testo libero), stepper del serbatoio (5–120 L, passo 5), carburante predefinito.
  - **Consumi e Carburante** (come mockup 5): riquadro con il **consumo medio misto** in uno **slider 3–40 km/L (passo 0,1)**, pill del valore corrente con «Ripristina» a 15 accanto (visibile solo se il valore è cambiato), tre tacche distribuite sotto lo slider («8 Sport», «15 Medio», «30 Eco») e l'indicazione dinamica **Costo / km** (`~€0,12/km`) = prezzo di riferimento del carburante predefinito ÷ consumo. Il riferimento è quello **manuale** se «Manuale» è attivo e per quel carburante c'è un valore, altrimenti l'**ultimo automatico** noto; senza nessuno dei due mostra «—» e l'unico testo «nessun prezzo di riferimento noto» (nessun dato inventato). La derivazione è un **tooltip** sul valore («calcolato da €1,999/L (ultimo riferimento automatico Benzina) ÷ 15,0 km/L»). Segue la bozza non salvata.
  - **Algoritmo & Filtri:**
    - **Valore del tuo tempo** (`V_time`) a **preset nominati** come chip (attivo `bg-primary text-on-primary`): **Solo denaro** 0 €/h (il tempo non entra in `S_net`), **Tranquillo** 6 €/h (≈ €0,10/min), **Bilanciato** 9 €/h (≈ €0,15/min, **default di fabbrica**), **Ho fretta** 15 €/h (≈ €0,25/min) e **Personalizzato**, che rivela uno slider 3–60 €/h (passo 1) visibile solo se selezionato. Caption: «Quanto vale un'ora del tuo tempo? RouteFuel sottrae al risparmio il tempo perso in deviazione, a questo valore.» Internamente, in `localStorage` e nella richiesta API il valore è **sempre €/min** (€/h ÷ 60); la validazione resta **0,00–1,00 €/min**. La configurabilità richiesta dal PRD è preservata: cambia solo la presentazione.
    - **Prezzo di riferimento** Automatico (default, consigliato) / **Manuale** con un campo €/L per carburante (0,5–4), pre-compilato con l'ultimo valore automatico noto.
    - **Deviazione massima predefinita:** slider 1–10 km (passo 1, factory 5, `DETOUR_RANGE` come lo schema API) che precompila lo slider della Home.
    - **Default del percorso:** «Evita autostrada», «Evita pedaggi», «Evita traghetti».
    - **«Cerca solo stazioni Self per impostazione predefinita»** (default ON): precompila lo switch «Solo Self» della Home.
  - **Notifiche & Dati di Sistema:** soglia di freschezza dei prezzi (intero 1–720 ore, default 72) e la fonte dei prezzi; le notifiche non esistono e lo dice.
- **Bozza e azioni:** le modifiche restano in una bozza finché non si preme **«Salva Preferenze»** (disattivato senza modifiche o con campi non validi); **«Ripristina Predefiniti»** riporta subito tutto ai valori di fabbrica (**Automatico** sul prezzo di riferimento, **«Bilanciato»**, nessuna esclusione di percorso, «Solo Self» ON, 72 h…) e lo salva.
- **Campi persistiti** (`routefuel.settings.v1` → `settings`, tutti in `sanitizeSettings`, `FACTORY_SETTINGS` e `samePreferences`, con un test che fallisce se un campo nuovo non è coperto): `vehicle` (`bodyType`, `modelName`, `tankLiters` 5–120, `defaultFuel`), `consumptionKmPerLiter` (3–40, factory 15), `valueOfTimePerMinute` (0–1 €/min, factory 0,15 = «Bilanciato»), `referenceMode` (`auto` | `manual`), `manualReference` (per carburante, 0,5–4 €/L), `avoidMotorway`, `avoidTolls`, `avoidFerries` (factory `false`), `onlySelf` (factory `true`), `defaultMaxDetourKm` (1–10, factory 5), `maxPriceAgeHours` (1–720 intero, factory 72). In più `lastAutomaticReference` (cache dell'ultimo prezzo automatico per carburante: non è una preferenza, non conta per «Salva Preferenze» e sopravvive al ripristino).
- **Persistenza:** `localStorage`, chiave versionata **`routefuel.settings.v1`** (`{ version: 1, settings }`): versione sconosciuta, JSON corrotto o campi fuori intervallo tornano ai valori di fabbrica campo per campo; un salvataggio precedente senza i campi nuovi (pedaggi, traghetti, «Solo Self») si legge con i default. Con lo storage bloccato si usa una copia in memoria. Non vengono salvati indirizzi né coordinate (vincolo ToS Mapbox; nessun preset Casa/Lavoro: arriva con la Home in M7).
- **Form di ricerca (Home):** parte dai default salvati (carburante, serbatoio come «Litri», consumo) e, quando le Impostazioni cambiano, riparte dai nuovi valori. Accanto a **«Solo Self»** c'è lo switch **«Evita autostrada»**: entrambi precompilati dalle Impostazioni, **modificabili per ricerca** e inviati con ogni ricerca (le Impostazioni restano il default globale). Ogni ricerca porta anche `valueOfTimePerMinute`, `maxPriceAgeHours`, i default di pedaggi e traghetti e, se manuale, `referencePriceOverride` del carburante cercato. Pedaggi e traghetti **non** hanno uno switch nella Home: si cambiano dalle Opzioni percorso nei Risultati o dai default nelle Impostazioni.
- **Esclusioni di percorso:** `POST /search` accetta `avoidMotorway`, `avoidTolls` e `avoidFerries` (default `false`) e li conserva nella sessione di ricerca. **Verificato su Mapbox Directions `mapbox/driving`** (documentazione e chiamata reale sul percorso di test) che `exclude=motorway`, `exclude=toll` e `exclude=ferry` sono supportati e si combinano con la virgola (`motorway,toll,ferry`): quindi sono tutti implementati, nessun toggle disabilitato. L'insieme di esclusioni (in ordine fisso) va **al percorso diretto e a verifiche, percorso con sosta e dettaglio stazione**: la **baseline della deviazione è sempre il diretto con lo stesso insieme**. La cache dei percorsi ha una chiave per insieme (`#exclude=motorway,toll`…); kill switch e budget restano gli stessi. Il **pedaggio resta fuori da `S_net`** (nessun dato di costo): le opzioni cambiano solo il tracciato, non il costo. Nota: sul percorso di test «Evita pedaggi» dà lo stesso chilometraggio (13 km) di «Evita autostrada», perché l'A9 è a pedaggio.
- **Opzioni percorso (Risultati, stile Google Maps):** al posto del banner un **chip-pulsante «Opzioni percorso»** (icona tune) che mostra lo stato attivo, es. «Opzioni percorso · senza autostrada» / «senza autostrada e pedaggi». Apre un **foglio `rounded-t-3xl`** con tre toggle (**Evita autostrade, Evita pedaggi, Evita traghetti**) precompilati dalla ricerca corrente; **«Applica»** (attivo solo se qualcosa è cambiato) rilancia `POST /search` con la **stessa richiesta** (stesso A/B e parametri) e il nuovo insieme; **«Reimposta»** riporta i toggle ai default delle Impostazioni (poi serve «Applica»). Durante il ricalcolo restano visibili i risultati precedenti con un avviso (nessun rimbalzo alla Home). Una nuova ricerca riparte da filtri e ordinamento puliti.
- **Pill «Autostrada» (filtro Tipo Impianto):** se la ricerca attiva ha evita-autostrade, la pill è **disabilitata e grigia** con tooltip «Non disponibile con Evita autostrada» (nessun percorso usa l'autostrada); se era attiva e una nuova ricerca o le opzioni attivano evita-autostrade, **si disattiva da sola**. **Nessun auto-disable per evita-pedaggi** (né traghetti): il filtro Tipo Impianto è un dato dell'anagrafica, non dipende dal tracciato.
- **Prezzo di riferimento manuale:** `POST /search` accetta `referencePriceOverride` (0,5–4 €/L): sostituisce **completamente** la cascata di P_avg (livello `manual`, nessun blending), anche nel costo al km e nel differenziale del dettaglio. Resta valido finché non si torna ad Automatico (i valori manuali restano memorizzati ma non contano). Un carburante senza valore manuale usa il calcolo automatico.
- **Barra inferiore a 3 tab:** Cerca, Risultati, Impostazioni.
- **Fuori scope, per scelta:** preset Casa/Lavoro (Home in M7), notifiche, Screen 4.

**Criteri di accettazione:**
- [x] Modificare e salvare le impostazioni cambia i default precompilati nella ricerca successiva (test web e verifica nel browser, compreso «Solo Self» spento che parte spento nella Home).
- [x] Attivare «Manuale» sul prezzo di riferimento sostituisce il valore usato in `S_net` in tutte le ricerche successive, tornare ad Automatico ripristina la cascata (test api e web; verificato nel browser).
- [x] «Ripristina Predefiniti» riporta tutti i campi ai valori di fabbrica, incluso Automatico, «Bilanciato» e «Solo Self» ON (test e browser).
- [x] «Opzioni percorso» nei Risultati: chip con stato attivo, foglio con tre toggle, «Applica» rilancia la ricerca (stesso A/B, nuovo insieme), «Reimposta» ai default (test e browser: percorso di test 16 km → 13 km senza autostrada o senza pedaggi; payload con `avoidMotorway`/`avoidTolls`/`avoidFerries`).
- [x] Accordion tutti chiusi al caricamento; preset del valore del tempo (incluso «Personalizzato» e 0 €/h); slider dei consumi con costo/km; pill «Autostrada» disabilitata con evita-autostrade (test e browser).
- [x] Barra a 3 tab; nessuna regressione su Screen 1, 2 e 3 (suite esistente verde).
- [x] Typecheck pulito; test a fine milestone: core 152, api 218 (+21 sul database), web 309.

**Revisione PO (02/10/2026)** — decisioni applicate, una per punto (testo integrale in `OPEN_QUESTIONS.md`, «Decisioni risolte»):
1. **Accordion tutti chiusi** al caricamento di `/settings`.
2. **Valore del tuo tempo a preset** (Solo denaro 0, Tranquillo 6, Bilanciato 9 = default, Ho fretta 15 €/h, Personalizzato con slider 3–60 €/h); salvataggio sempre in €/min; validazione 0,00–1,00 €/min anche lato API; «Ripristina Predefiniti» → «Bilanciato».
3. **Consumi e Carburante come mockup 5:** slider 3–40 km/L passo 0,5, pill, «Ripristina» a 15, caption «8 Sport · 15 Medio · 30 Eco», costo/km dinamico.
4. **Default e per-ricerca:** switch «Evita autostrada» nella Home accanto a «Solo Self», entrambi precompilati dalle Impostazioni e modificabili per ricerca; nuova impostazione «Cerca solo stazioni Self per impostazione predefinita» (ON). Sovrascrive l'interpretazione M4·4.
5. **Opzioni percorso stile Google Maps** con evita autostrade / pedaggi / traghetti (supportati da Mapbox: verificato) e default nelle Impostazioni; pedaggio fuori da `S_net`.
6. **Pill «Autostrada»** disabilitata con evita-autostrade, auto-spenta se attiva; nessun auto-disable per pedaggi.

**Chiusura M4 (03/10/2026)** — decisioni applicate (testo integrale in `OPEN_QUESTIONS.md`, «Decisioni risolte»):
- **Nuovo campo «Deviazione massima predefinita»** (slider 1–10 km, factory 5) che precompila la Home; reset a 5.
- **Pannello «Consumi e Carburante»:** tre tacche con `justify-between`, «Ripristina» accanto alla pill, derivazione del costo/km nel tooltip, passo dello slider 0,1.
- **Interpretazioni M4·1–3 e M4·5–9 confermate** come implementate.
- **Fuori MVP:** **M4·10** «Soglia risparmio minimo» (mockup 5): `S_net` resta l'unico criterio di ordinamento, da rivalutare dopo il lancio con i dati d'uso; **M4·11** «Toggle costo deviazione chilometrica» (mockup 5): `C_km` resta sempre attivo nella formula (decisione vincolante pre-M0).
- Test trasversali: `valueOfTimePerMinute = 0` («Solo denaro») conservato da `sanitizeSettings`; ogni campo persistito abilita «Salva Preferenze»; la chiave di cache del routing include l'insieme di esclusioni (test già presente).

**Decisioni e affinamenti emersi in implementazione** (le interpretazioni sono tutte chiuse in `OPEN_QUESTIONS.md`, «Decisioni risolte», punti M4·1–11):
1. **`engines`: Node ≥ 24** (unica configurazione testata, in locale e in CI); README aggiornato.
2. **Un difetto trovato solo nel browser reale:** sull'Accordion la classe `flex` batteva l'attributo `hidden` e le sezioni chiuse restavano visibili; ora `flex` solo da aperta, con test sulla causa (jsdom non carica il CSS).
3. **Cache dell'ultimo prezzo automatico:** per pre-compilare «Manuale» e il costo/km ogni ricerca automatica ricorda il P_avg del suo carburante (mai quelli manuali) nello stesso oggetto di `localStorage`; non è una preferenza e «Ripristina Predefiniti» la conserva.
4. **Schema API:** `valueOfTimePerMinute` accettato da 0 a 1 (allineato alla validazione dell'interfaccia; prima 0–2); `avoidTolls` e `avoidFerries` booleani con default `false` (retrocompatibile).
5. **`Personalizzato` è uno stato dell'interfaccia, non una preferenza:** all'apertura vale solo se il valore salvato non coincide con un preset; un valore dello slider uguale a un preset (es. 9 €/h) resta «Personalizzato» finché non si sceglie il chip; da «Solo denaro» (0, fuori dallo slider) lo slider parte dal suo minimo, 3 €/h.

---

## Milestone 5 — PWA & Rifinitura ✅ implementata (in revisione)

Branch: `feat/milestone-5-pwa`.

**Contenuto (come implementato):**
- **Manifest e installabilità** (`vite-plugin-pwa` 1.3, Workbox `generateSW`, `registerType: "autoUpdate"`): `name`/`short_name` «RouteFuel», `description`, `theme_color #059669` (primary), `background_color #f8f9ff` (surface), `display: standalone`, `orientation: portrait`, `start_url: /`. **Icone PNG generate** da `assets/logo.svg` con `sharp` (`pnpm --filter @routefuel/web generate:icons`, PNG committati): 192×192 e 512×512 «any», 512×512 «maskable» (fondo a tutto campo, logo nel 78%), `apple-touch-icon.png` 180×180 e `favicon.ico`. `index.html`: `theme-color`, `apple-touch-icon`, `description`, favicon.
- **Caching:** la **shell** (HTML, JS, CSS, icone, manifest) è in *precache* versionato — cache-first, hash del contenuto, pulizia delle versioni vecchie a ogni deploy, `skipWaiting`/`clientsClaim` per l'aggiornamento automatico; `navigateFallback` apre la stessa shell per `/results`, `/settings`, `/station/…` anche offline. I **font** di Google Fonts: file `CacheFirst`, CSS `StaleWhileRevalidate`. I **dati** (`/search`, `/geocode`, `/health` dell'API) sono **`NetworkOnly`: mai in cache** (motivo e deviazione dalla richiesta, che indicava `NetworkFirst`, in OPEN_QUESTIONS M5·1). Il chunk di Mapbox GL (~1,9 MB) è fuori dalla precache; tile e stile Mapbox non vengono mai messi in cache (ToS).
- **Offline:** la shell si apre; la ricerca e i suggerimenti di indirizzo senza rete mostrano un errore chiaro («Sei offline: la ricerca ha bisogno della connessione…»); sui Risultati la mappa dice «Mappa non disponibile offline» e l'elenco già caricato resta visibile; sulla Home un avviso discreto.
- **Installazione:** hook `useInstallPrompt` (cattura `beforeinstallprompt`, anche se scatta prima del montaggio; una volta per sessione; non propone nulla se già installata/standalone o su browser senza l'evento) e `InstallBanner` — una riga compatta in cima alla Home, `rounded-lg`, `shadow-md`, `bg-surface-container-lowest`, CTA «Installa RouteFuel» e «×» («Non ora»); non copre nulla, nemmeno su schermi stretti.
- **Audit e correzioni** (`docs/LIGHTHOUSE.md`): landmark `main` su Risultati e Impostazioni, `robots.txt` valido, Google Fonts non bloccante, `vercel.json` (rewrite SPA per `/results`, `sw.js` e manifest senza cache HTTP, `/assets` immutabili).
- **Verifica della build** (`pnpm --filter @routefuel/web verify:pwa`, eseguita anche in CI nello stesso job): `dist/sw.js`, `manifest.webmanifest`, campi del manifest, icone con le misure giuste, link in `index.html`, precache senza il chunk della mappa e senza endpoint dati, nessun `NetworkFirst`, `robots.txt`, `vercel.json`.
- **Fuori scope, per scelta:** mappa offline (Mapbox GL non la supporta sul web), cache dell'«ultima lista risultati» prevista da `STACK_DECISION.md` (superata: nessun prezzo in cache), notifiche push, banner di installazione manuale per iOS (OPEN_QUESTIONS M5·3).
- **Checklist Mapbox (anche M6):** restrizione URL del token `routefuel-web` sul dominio di produzione e avviso di spesa nel pannello Mapbox — da fare al momento del deploy.

**Criteri di accettazione:**
- [x] App installabile su desktop: Chromium non segnala errori di installabilità e Edge emette `beforeinstallprompt`; banner e CTA verificati. ⚠️ Mobile (Android) e Safari/iOS **non provati su dispositivo reale**: prova manuale in OPEN_QUESTIONS M5·3.
- [x] Lighthouse **PWA 100** (Lighthouse 11); nessuna regressione grave: Home 91/96/100/100, Impostazioni 100/95/96/100, Risultati e Dettaglio accessibilità 96, best practice 100, SEO 100 (tabella completa in `docs/LIGHTHOUSE.md`). Aperto: contrasto bianco su `#059669` (M5·2).
- [x] Shell caricabile offline, ricerca offline con errore chiaro, dati prezzo mai in cache (0 voci di cache che siano dati; richieste dati offline falliscono).
- [x] `pnpm build` produce `dist/sw.js` e `dist/manifest.webmanifest` (verificato da `verify:pwa` e dalla CI).
- [x] Typecheck pulito; test: core 152, api 218 (+21 sul database), web 349.

**Decisioni e affinamenti emersi in implementazione** (le interpretazioni da confermare sono in `OPEN_QUESTIONS.md`, punti M5·1–5):
1. **Dati `NetworkOnly`, non `NetworkFirst`** (M5·1): `NetworkFirst` ripiega su una copia vecchia quando la rete cade, cioè mostrerebbe prezzi non freschi, contro l'obiettivo dichiarato.
2. **Banner di installazione nel flusso della pagina, non fisso:** la prima versione, fissa sopra la barra di navigazione, a 420 px andava a capo su 8 righe e copriva il pulsante di ricerca; scoperto nel browser reale (Edge ha emesso davvero `beforeinstallprompt`).
3. **Errore offline distinto:** `navigator.onLine === false` produce il codice `OFFLINE` con un messaggio dedicato; con la rete su ma il server giù resta l'errore di rete di sempre.
4. **Limite dell'emulazione offline di Chromium:** non si applica alle richieste del service worker; lo script di verifica la applica anche al suo target.
5. **Lighthouse ≥ 12 non ha più la categoria PWA:** punteggio PWA misurato con la 11.7.1, il resto con la 13.5.0.

---

## Milestone 6 — Hardening pre-rilascio

**Contenuto:**
- Copertura test end-to-end sul percorso critico (ricerca → risultati → dettaglio → deep-link).
- Job di ingestione schedulato in produzione (cron) con logging/alerting minimo su fallimento.
- Documentazione di deploy in `README.md` aggiornata con i passi reali eseguiti.
- Job di pre-riscaldamento (warming) dei prezzi live: **solo dopo l'autorizzazione formale del ministero** (`OPEN_QUESTIONS.md`, punto 7).

**Criteri di accettazione:**
- [ ] Ingestione schedulata verificata su ambiente di staging per almeno un ciclo giornaliero reale.
- [ ] Nessun segreto in repo (verifica finale `.env.example` vs variabili realmente usate).
- [ ] Token Mapbox pubblico con URL restriction sul dominio di produzione e avviso di spesa configurato nel pannello Mapbox.

---

## Milestone 7 — Fedeltà UI ai mockup & polish

**Backlog (emerso dalla revisione di M2):**
- **Home = mockup 1:** search bar con glow e «Tragitti Frequenti»; il form di ricerca si apre in un bottom sheet al tap (`rounded-t-3xl`).
- **Barra di navigazione a 4 tab** quando le schermate corrispondenti saranno disponibili (oggi solo «Cerca» e «Risultati»).
- **Contrasto:** testo bianco su `bg-primary` (chip attivi, badge «Migliore», pin verde) a 3,76:1 su testo piccolo e segnaposto dei campi di ricerca in `text-outline` (4,49:1); accettati per ora, da risolvere (token di design o peso/dimensione del testo).
- **Stile mappa brand in Mapbox Studio** allineato ai token di `DESIGN.md` (superfici, strade, acqua), pubblicato e agganciato via `VITE_MAPBOX_STYLE_URL`.
- **Terzo ordinamento «Miglior tempo»** (presente nel mockup 2): da valutare con dati d'uso reali.
- **Elenco difetti grafici del product owner** (in arrivo).
- **«Solo Self»:** rivedere la posizione del toggle (form della Home / pill in Screen 2) e il comportamento della pill bloccata.
- Altre difformità dai mockup emerse in revisione (scelte già confermate per M2: `OPEN_QUESTIONS.md`, «Decisioni risolte», punto 16).

**Criteri di accettazione:** da definire a inizio milestone, confrontando schermata per schermata con i mockup in `mockup/`.

---

## Infrastruttura trasversale

**CI (GitHub Actions)** — `.github/workflows/ci.yml`, introdotta dopo M3:
- **Trigger:** `pull_request` e `push` su `main` e `feat/*`.
- **Un solo job** (`ubuntu-latest`, timeout 15 min): checkout → pnpm (versione da `packageManager`, 12.6.0) → Node 24 (la stessa versione usata in locale) con cache dello store pnpm → `pnpm install --frozen-lockfile` → `pnpm test` → `pnpm typecheck`. `pnpm test` è la suite ermetica (zero rete, zero database); i test su PostgreSQL (`pnpm test:db`) restano in locale.
- **Vincolo di costo (vincolante):** il repository è **privato**, quindi vale il tetto di **2.000 minuti/mese** del piano free. Per questo: **nessun altro workflow e nessun job extra** (niente matrici, niente servizi database, niente deploy in CI). `concurrency` annulla la run precedente dello stesso riferimento quando arriva un nuovo push. Nota: una pull request aperta da un branch `feat/*` fa partire due run (push e `pull_request`); se i minuti scarseggiano si può togliere il trigger `push` su `feat/*` e tenere solo `pull_request`.
- Qualsiasi nuova automazione va valutata contro questo budget prima di essere aggiunta.

---

## Fuori scope (esplicitamente, per questa fase)

- Screen 4 "Modifica Percorso" (SOSPESO da decisione prodotto).
- Autenticazione, pagamenti, push notification.
- Prezzi crowdsourced.
- App nativa.
