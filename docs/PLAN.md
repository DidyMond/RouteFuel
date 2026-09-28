# Plan — Milestone Implementative RouteFuel

Stack di riferimento: vedi `STACK_DECISION.md` (in attesa di conferma). Scope e decisioni prodotto: vedi `PRD.md`. Domande bloccanti: vedi `OPEN_QUESTIONS.md`.

Metodo: una milestone alla volta, riepilogo delle modifiche a fine milestone, nessuna interpretazione libera di ambiguità (→ `OPEN_QUESTIONS.md`).

---

## Milestone 0 — Vertical Slice (questa sessione, dopo conferma stack)

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
- [ ] `docker compose up` avvia Postgres+PostGIS localmente senza errori.
- [ ] Eseguendo l'ingestione, il DB contiene stazioni con coordinate valide e prezzi collegati (verificabile con una query di conteggio).
- [ ] Le ~20 righe con `|` letterale nel nome impianto vengono parsate correttamente (coordinate e id corretti, verificabile puntualmente sugli id noti trovati in fase di analisi).
- [ ] Rilanciare l'ingestione due volte non duplica righe (idempotenza).
- [ ] `GET /health` risponde 200 con stato DB.
- [ ] `pnpm dev` avvia frontend che mostra header + search bar coerenti con `DESIGN.md` (colori, font, radii, nessun colore/raggio fuori palette).
- [ ] Nessun segreto hardcodato nel codice; tutte le chiavi passano da variabili d'ambiente.
- [ ] Test automatici sulla normalizzazione CSV → entità DB, eseguiti su fixture locali (zero chiamate di rete nei test), incluso il fixture con il bug del `|` nel nome impianto e con righe a coordinate mancanti/anomale.

---

## Milestone 1 — Ricerca A→B e calcolo core (logica pura, no UI mappa ancora)

**Contenuto:**
- `packages/core`: implementazione pura (no I/O) di:
  - Formula Net Savings Index, con `C_km = P_avg / consumo_km_per_litro` (solo costo carburante, calcolato su `P_avg` non su `P_station`).
  - Motore `P_avg` con cascata a 3 livelli, ricalcolato per ogni combinazione (`fuel_type`, `self`/`servito`): (1) mediana stazioni "on-route" con deviazione one-way ≤ 0.5 km (costante fissa, indipendente dallo slider utente); (2) se campione < 3, mediana su tutte le stazioni nel corridoio (raggio = `max_detour_km` scelto dall'utente); (3) se ancora < 3, mediana nazionale per quella combinazione fuel/modalità. Soglia minima campioni (`N_MIN = 3`) come costante unica condivisa dai tre livelli.
  - Calcolo deviazione con **semantiche esplicite e distinte**: `corridor_buffer_km` (one-way, raggio di pre-filtro PostGIS/turf, generoso, = `max_detour_km` per default, cap a 15km) ≠ `on_route_threshold_km` (0.5 km one-way, fisso, solo per il livello 1 di `P_avg`) ≠ `max_detour_km` (round-trip: km extra reali di `A→stazione→B` rispetto a `A→B`, è il criterio di accettazione/esclusione finale di una stazione dai risultati, stesso significato del termine `D_detour` nella formula).
  - Logica Self/Servito: filtro "Solo Self" ON (default) → include solo stazioni con prezzo Self per il carburante scelto; OFF → include anche stazioni "solo Servito" (badge esplicito), usando per ciascuna stazione il prezzo Self se disponibile altrimenti Servito (mai una media dei due).
- `GeocodingProvider`: interfaccia (`autocomplete(query, proximity)`, `reverseGeocode(lat, lon)`) + `FixtureGeocodingProvider` (coordinate fisse per indirizzi di test noti, zero rete) + implementazione Mapbox Geocoding API v6 (non Search Box API).
- `RoutingProvider`: interfaccia (`getRoute(a, b, profile)`) + `MockProvider` (rotta fissa/deterministica per test) + implementazione reale Mapbox Directions, profilo `mapbox/driving` (non `driving-traffic`: risultati deterministici, testabili e cache-abili; rivalutare post-MVP se serve un differenziale "traffico in tempo reale").
- Strategia ibrida di deviazione: proxy geometrico (turf.js, calcolo locale) per il ranking iniziale di **tutte** le stazioni candidate nel corridoio; ricalcolo con routing reale, in parallelo e in background non appena pronto il ranking proxy, solo per le **top 5**; la lista visibile si riordina "in place" quando arrivano i valori verificati (nessun blocco della UI in attesa). Cache breve (in-memory/Redis, TTL 10–15 min, chiave `origin arrotondato + dest arrotondato + station_id + profilo`) per evitare chiamate duplicate sulla stessa combinazione.
- Gestione fallimento routing reale per una candidata: mantenere il valore proxy con un badge "stima" esplicito, mai un valore inventato o un errore bloccante.
- Endpoint `POST /search`: dati input (origine, destinazione, carburante, litri, deviazione massima, consumo, modalità) → corridoio calcolato → stazioni candidate con `S_net` e ranking. **Rate limiting per IP** (es. 20 richieste/minuto) a protezione della spesa Mapbox lato server (il token backend non ha restrizione URL, quindi questo endpoint è l'unico argine).
- Gestione token Mapbox **separati per contesto** (mai un token unico): token pubblico con URL-restriction per il dominio di produzione (Map GL JS + Geocoding, bundle frontend), token pubblico senza restrizione per le chiamate Directions lato backend (mai esposto al browser), token permissivo separato per sviluppo locale.
- **Kill switch/modalità degradata**: contatore mensile delle chiamate Directions lato backend; superata una soglia di sicurezza configurabile (es. 80.000, sotto il free tier di 100.000), disabilitare automaticamente il ricalcolo reale top-5 e usare solo la stima proxy per tutte le stazioni, con nota discreta in UI ("stime di deviazione approssimate"), fino al reset mensile.
- Query geospaziale PostGIS: buffer corridoio (`corridor_buffer_km` one-way) + `ST_DWithin` per selezionare stazioni candidate.
- Home (Screen 1): form di ricerca reale (input A/B con autocomplete Mapbox + debounce 300–400ms/minimo 3 caratteri, chip carburante, stepper litri, slider deviazione) collegato all'endpoint.

**Criteri di accettazione:**
- [ ] Test unitari su `packages/core` coprono: risparmio positivo/negativo, deviazione zero, deviazione oltre soglia massima (esclusione), cascata `P_avg` sui 3 livelli (incluso il caso GPL/Metano a campione scarso che deve ricadere sul livello 2 o 3), esempio numerico a 5 stazioni della sezione P_avg — zero chiamate esterne.
- [ ] `MockProvider` e `FixtureGeocodingProvider` permettono di testare `/search` senza rete né chiavi API.
- [ ] Dato un percorso reale (es. Milano→Bologna), l'endpoint ritorna un set di stazioni ordinabile per `S_net` in tempo ragionevole (< 3s con dataset MIMIT completo) usando il proxy, con aggiornamento asincrono della top-5 via routing reale.
- [ ] Superare artificialmente la soglia del kill switch (in test) attiva la modalità degradata senza errori.
- [ ] Home invia la ricerca e riceve risultati (anche se mostrati solo come JSON/lista grezza in questa milestone).

---

## Milestone 2 — Screen 2: Risultati & Mappa Distributori

**Contenuto:**
- Integrazione mappa (provider scelto) con tracciato percorso e pin stazioni.
- Bottom sheet con card stazione (badge brand testuale/iniziali da `Bandiera` tramite tabella di lookup dedicata — non hardcoded per stazione, così l'inserimento futuro di loghi ufficiali è solo un aggiornamento della tabella/asset, non una migrazione dati — prezzo, badge deviazione/risparmio, badge "Migliore"), fedele a `DESIGN.md`.
- Filtri di ordinamento (Più conveniente / Minor deviazione / Sul percorso) e pill secondarie: **Solo Self** (dato reale, campo `isSelf`) e **Autostrada & Extraurbane** (dato reale confermato: `Tipo Impianto` nel CSV ha davvero due valori distinti, `Stradale` ~23.450 stazioni e `Autostradale` ~540 — filtro implementabile). **"Aperto ora" rimosso** (nessun dato disponibile nei CSV MIMIT).
- Banner fonte dati MIMIT con timestamp di ingestione; prezzi oltre la soglia di freschezza (default 72h) **esclusi dai risultati** (non solo marcati) per quella combinazione stazione/carburante; se l'intero dataset risulta oltre soglia (es. ingestione fallita), stato vuoto esplicito con azione secondaria "Mostra comunque (dati meno recenti)".
- Prezzo di riferimento (`P_avg`) mostrato nel banner con indicazione del livello di fallback usato ("basato su N stazioni sul percorso" / "sul corridoio" / "media nazionale"); se in Impostazioni (M4) l'utente ha impostato un valore manuale, il banner mostra "Prezzo di riferimento: impostato manualmente" con link per tornare ad automatico.

**Criteri di accettazione:**
- [ ] Mappa mostra percorso e marker entro il corridoio, con la stazione migliore evidenziata.
- [ ] Cambiare filtro di ordinamento riordina la lista senza nuova chiamata rete (ordinamento client-side sui risultati già caricati).
- [ ] Il filtro "Autostrada & Extraurbane" filtra realmente per `Tipo Impianto`.
- [ ] Timestamp di ingestione sempre visibile; nessuna stazione con prezzo oltre soglia (72h default) appare nei risultati per il carburante interessato.

---

## Milestone 3 — Screen 3: Dettaglio Stazione

**Contenuto:**
- Pagina dettaglio con meta stazione, bento impatto viaggio, matrice prezzi Self/Servito.
- Deviazione ricalcolata con routing reale **on-demand ogni volta che si apre Screen 3** per una stazione (riuso della cache se già verificata come parte della top-5 nella stessa ricerca; altrimenti singola chiamata con breve stato di caricamento) — Screen 3 non mostra mai una stima proxy grezza come se fosse un dato definitivo.
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

**Criteri di accettazione:**
- [ ] App installabile su mobile (Add to Home Screen) e desktop.
- [ ] Lighthouse PWA score verde; nessuna regressione performance/accessibilità grave rispetto a M4.

---

## Milestone 6 — Hardening pre-rilascio

**Contenuto:**
- Copertura test end-to-end sul percorso critico (ricerca → risultati → dettaglio → deep-link).
- Job di ingestione schedulato in produzione (cron) con logging/alerting minimo su fallimento.
- Documentazione di deploy in `README.md` aggiornata con i passi reali eseguiti.

**Criteri di accettazione:**
- [ ] Ingestione schedulata verificata su ambiente di staging per almeno un ciclo giornaliero reale.
- [ ] Nessun segreto in repo (verifica finale `.env.example` vs variabili realmente usate).

---

## Fuori scope (esplicitamente, per questa fase)

- Screen 4 "Modifica Percorso" (SOSPESO da decisione prodotto).
- Autenticazione, pagamenti, push notification.
- Prezzi crowdsourced.
- App nativa.
