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
## Milestone 3 — Screen 3: Dettaglio Stazione

**Contenuto:**
- Pagina dettaglio con meta stazione, bento impatto viaggio, matrice prezzi Self/Servito.
- Deviazione ricalcolata con routing reale **on-demand ogni volta che si apre Screen 3** (l'endpoint `GET /search/:id/stations/:stationId/route` esiste già dalla revisione di M2 e restituisce anche `detourKm`/`detourMinutes` coerenti) per una stazione (riuso della cache se già verificata come parte della top-5 nella stessa ricerca; altrimenti singola chiamata con breve stato di caricamento) — Screen 3 non mostra mai una stima proxy grezza come se fosse un dato definitivo.
- CTA "Apri nel Navigatore" con deep-link: rilevamento automatico OS (iOS→Apple Maps, Android→Google Maps) come scelta di default, con menu esplicito sempre raggiungibile (incluso Waze) per scegliere altrimenti.
- **Rimozione totale (nessun placeholder visibile)** di: pill uscita autostradale specifica, badge "Aperto ora", griglia servizi/amenities, telefono, numero pompe (nessuno di questi campi esiste nei CSV MIMIT). Bookmark e Share **mantenuti** (azioni client-side pure: `localStorage` e Web Share API, non richiedono dati MIMIT).

**Criteri di accettazione:**
- [ ] Nessun dato inventato: ogni campo mostrato è tracciabile a una colonna reale dei CSV MIMIT o a un calcolo di `packages/core`.
- [ ] Aprire Screen 3 per qualunque stazione mostra sempre una deviazione verificata da routing reale, non una stima.
- [ ] CTA naviga apre l'app esterna scelta (o menu di scelta) con coordinate corrette.
- [ ] Nessuna sezione UI per uscita autostradale/orari/servizi/telefono/numero pompe è presente nel markup.

---

## Milestone 4 — Screen 5: Impostazioni & Veicolo

**Contenuto:**
- Accordion profilo veicolo, consumi/carburante, algoritmo/filtri, notifiche/dati sistema.
- Toggle **«Evita autostrada»** (PRD): passa `exclude=motorway` a Directions **sia al percorso diretto sia alle verifiche** (la deviazione si misura sempre contro il diretto dello stesso tipo); il **pedaggio resta fuori da `S_net`** (Mapbox non ne dà l'importo). Dati raccolti il 30/09/2026 (Mapbox `driving`): Ceriano Laghetto → Lomazzo — diretto 15,49 km / 17,6 min con 5,28 km di A9 a pedaggio, senza autostrada 12,50 km / 18,2 min; Milano → Bologna — diretto 211,0 km / 149,5 min (198,1 km di A1), senza autostrada 255,8 km / 285,9 min. Con «Evita autostrada» sul percorso di test la stazione 1858 Bregnano costerebbe +0,44 km / +2,4 min invece di +1,6 km / +2,9 min.
- Accordion "Algoritmo & Filtri": nuovo campo **Valore del tuo tempo** (`V_time`, €/min, default 0.15, range validato 0.05–1.00) e nuovo controllo **Prezzo di riferimento**: toggle Automatico (default, consigliato) / Manuale — con un campo numerico per carburante quando "Manuale" è selezionato, pre-compilato con l'ultimo valore automatico calcolato al momento dell'attivazione. Quando manuale, il valore sostituisce **completamente** il calcolo a cascata per tutte le ricerche successive (nessun blending), finché l'utente non torna ad Automatico. Questo soddisfa il requisito PRD di "override per singola ricerca" a livello pragmatico: non essendoci nell'MVP una UI di override rapido in Home/Risultati, il valore manuale impostato qui si applica a ogni ricerca fino a nuova modifica.
- Accordion "Notifiche & Dati di Sistema": campo soglia di freschezza prezzi (default 72h).
- Persistenza in `localStorage` (Open Question #10), con valori di default sensati e reset.
- Collegamento dei parametri salvati come default nel form di ricerca (Screen 1).

**Criteri di accettazione:**
- [ ] Modificare e salvare le impostazioni cambia i default precompilati nella ricerca successiva.
- [ ] Attivare "Manuale" su Prezzo di riferimento sostituisce il valore usato in `S_net` in tutte le ricerche successive, disattivarlo ripristina la cascata automatica.
- [ ] "Ripristina Predefiniti" riporta tutti i campi ai valori di fabbrica (incluso il ritorno ad Automatico per il prezzo di riferimento).

---

## Milestone 5 — PWA & Rifinitura

**Contenuto:**
- Manifest, service worker, installabilità, icona (da `assets/logo.svg`).
- Caching offline della shell (non dei dati prezzo, che devono restare freschi).
- Audit accessibilità/performance di base (Lighthouse) sulle 4 screen implementate.
- Hosting: rewrite SPA su Vercel (ogni percorso → `index.html`, necessario a `/results`).
- Checklist Mapbox (anche M6): restrizione URL del token `routefuel-web` sul dominio di produzione e avviso di spesa nel pannello Mapbox.

**Criteri di accettazione:**
- [ ] App installabile su mobile (Add to Home Screen) e desktop.
- [ ] Lighthouse PWA score verde; nessuna regressione performance/accessibilità grave rispetto a M4.

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

## Fuori scope (esplicitamente, per questa fase)

- Screen 4 "Modifica Percorso" (SOSPESO da decisione prodotto).
- Autenticazione, pagamenti, push notification.
- Prezzi crowdsourced.
- App nativa.
