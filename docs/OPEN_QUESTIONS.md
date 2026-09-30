# Open Questions — dopo la Milestone 2

> **Revisione funzionale di M2 (30/09/2026):** M2 resta in revisione. Bug della deviazione verificata risolto (punto **22**), «Sul percorso» con la nuova semantica (punto **12**), contrasto esteso a ≤14px (punti **17**/**21**). Dati sull'autostrada nel routing: punto **23**. Nessun merge su `main` finché non confermi.

> **Risolti con la revisione di M2 (29/09/2026):** punti **1**, **2**, **12**, **13**, **17** (dettaglio nei singoli punti). In attesa risposta ministero: **7** · rinviato: **9**.

> Milestone 1 **confermata e integrata in `main`** (29/09/2026). Stato dei punti: **7** in attesa risposta ministero · **9** rinviato · gli altri restano aperti con la raccomandazione indicata (procedo con quella se non indichi diversamente).

Le decisioni della checklist pre-M0 (stack, mapping carburanti, cascata `P_avg`, `C_km`, semantica della deviazione, strategia ibrida, Self/Servito, default, rimozione dei dati non disponibili) sono **confermate** e implementate: il dettaglio è in `PLAN.md`. Il repository GitHub è configurato (`origin`).

Qui restano i dubbi emersi durante l'implementazione di M1. Per ciascuno c'è una raccomandazione: se non indichi diversamente, procedo con quella.

---

## Azione a tuo carico

### A. Token Mapbox pubblico per il browser (serve per vedere la mappa di M2)
Il token server (`MAPBOX_SERVER_TOKEN`) **non va usato nel browser**. Per la mappa serve un secondo token, **pubblico e ristretto per URL**:
1. account.mapbox.com → **Tokens** → **Create a token**, nome `routefuel-web`, solo gli scope pubblici di default.
2. In **URL restrictions** aggiungi `http://localhost:5173/` (e in seguito il dominio di produzione). Se il browser dovesse comunque ricevere 401/403 da `localhost`, crea un secondo token solo per lo sviluppo, senza restrizioni.
3. Crea `apps/web/.env` (è ignorato da git) con `VITE_MAPBOX_PUBLIC_TOKEN=pk.…` e **riavvia** `pnpm dev:web` (Vite legge il file solo all'avvio; le variabili `VITE_*` sono già supportate nativamente, non serve alcun plugin).
Senza token l'app funziona lo stesso: la mappa mostra «Mappa non disponibile» e resta l'elenco. Ricorda che il token di default incollato in chat all'inizio va comunque ristretto o sostituito. **Costi:** Map GL JS include 50.000 caricamenti al mese, poi a pagamento; non esiste un kill switch lato client, quindi conviene impostare un avviso di consumo dal pannello Mapbox.

---

## Da decidere

### 1. Contraddizione in `DESIGN.md`: stile dei campi di input — ✅ RISOLTO (Rendering Rules confermate)
> **Decisione:** si seguono le Rendering Rules (raggio 1rem, `bg-surface-container-low`, altezza 44 px), come già implementato.

La prosa (§ Input Fields) dice altezza 44 px, sfondo `#F1F5F9`, raggio `0.75rem`; le *Rendering Rules* (che dichiarano di prevalere) dicono che gli input sono `rounded-DEFAULT` (1rem), e `#F1F5F9` non è un token. **Ho applicato le Rendering Rules:** 44 px, `bg-surface-container-low`, raggio 1rem. Confermi?

### 2. `DESIGN.md`: colori citati solo nella prosa, non tra i token — ✅ RISOLTO (mappatura confermata, nessun nuovo colore)
> **Decisione:** i colori della prosa (ambra, corallo, tinte dei badge) si mappano sui token esistenti; **non si aggiungono nuovi colori**. Il badge ambra «ritardo» resta non implementato.

Il vincolo è usare *esclusivamente* i token. La prosa cita ambra `#F59E0B` (avviso "deviazione > 5 min"), corallo `#EF4444` e le tinte dei badge (`#ECFDF5`, `#F0F9FF`, `#FFFBEB`), che non sono token. **Ho mappato sui token:** risparmio `bg-primary/10 text-primary`, deviazione `bg-secondary/10 text-secondary`, "non conviene" `error-container`. Il badge ambra "ritardo" non è implementato. Confermi la mappatura, oppure vuoi aggiungere ai token l'ambra e il corallo?

### 3. Il proxy sottostima: verificare più di 5 stazioni?
Sul percorso reale Milano→Bologna 3 delle prime 5 stazioni (stimate sotto i 5 km) risultavano oltre il limite col routing reale, e una stimata a 0.6 km era a 4.5 km. Dopo l'esclusione, la testa dell'elenco può quindi contenere stazioni ancora solo *stimate*. Opzioni:
- **(a)** lasciare `REFINE_TOP_N = 5` (oggi; costo massimo 6 chiamate Directions per ricerca);
- **(b)** *verificare finché non ci sono 5 stazioni confermate*, con un tetto (es. 10 chiamate extra): la testa dell'elenco è sempre affidabile, a costo di più chiamate (comunque ampiamente dentro il free tier alle stime attuali);
- **(c)** alzare N a 10 fisso.

**Raccomando (b)**, da rimandare a M2 (dove nasce la lista definitiva) se preferisci non toccare M1.

### 4. Ricerca di luoghi ("Milano Centrale", stazioni, ospedali…)
Il Geocoding v6 trova indirizzi, vie e località, **non i punti di interesse**: "Milano Centrale" restituisce il quartiere. Per i POI serve la Search Box API (500 sessioni/mese gratuite, poi $11.50 ogni 1.000). Opzioni: **(a)** solo indirizzi/località per l'MVP, con un suggerimento in UI ("digita via e città"); **(b)** aggiungere una piccola lista curata di grandi stazioni e aeroporti; **(c)** Search Box con limite rigido di sessioni. **Raccomando (a)**, riconsiderando (b) se emerge dall'uso.

### 5. Geocoding tramite il backend (scelta di M1)
Per rispettare la struttura richiesta (provider in `apps/api`) l'autocomplete passa dal nostro server, che vede il testo digitato ma non lo registra (test dedicato, rate limit). L'alternativa originaria era browser→Mapbox diretto con token ristretto per URL. **Raccomando di mantenere il proxy** finché non serve il token del browser (M2), poi rivalutare. Confermi?

### 6. Posizione del toggle "Solo Self"
Il PRD lo colloca tra le pill di Screen 2; in M1 non c'è ancora Screen 2 e la ricerca ne ha bisogno, quindi sta nel form della Home. Lo sposto in Screen 2 (come filtro che riesegue la ricerca) o lo lascio anche in Home?

### 7. Fonte dei prezzi in tempo reale: non è un'API pubblica — ⏳ IN ATTESA RISPOSTA MINISTERO
> **Decisione (29/09/2026):** la mail a `osservaprezzi@mise.gov.it` la invia il product owner. Nel frattempo la fonte live resta **best effort** con fallback dichiarato al CSV. Nessuna estensione del carico sul ministero (niente warming job, vedi punto 9) finché non c'è l'ok formale.

Il CSV MIMIT ha 1–2 giorni di ritardo per costruzione («informazioni in vigore alle ore 8 del giorno precedente»), quindi per avere prezzi aggiornati M1 interroga anche il **sito ufficiale** Osservaprezzi (`POST carburanti.mise.gov.it/ospzApi/search/zone`, lo stesso endpoint che alimenta la ricerca per zona del sito). Funziona, ma:
- **non è documentata né garantita**: nessun SLA, nessuna licenza d'uso esplicita per applicazioni terze, il formato può cambiare senza preavviso (l'endpoint del 2019 nel repository `teamdigitale/api-openapi-samples` oggi risponde `302`);
- **ha un limite di richieste**: ho ricevuto HTTP 429 dopo ~80 richieste in pochi minuti con 6 in parallelo (mie prove di carico). Il client ora usa concorrenza 3, cache per riquadro da 60 minuti, pausa su 429 e tetto di 40 riquadri per ricerca;
- se il servizio è indisponibile la ricerca degrada al CSV e lo dichiara in UI.

**Raccomando** di scrivere a `osservaprezzi@mise.gov.it` (contatto indicato nella descrizione dell'API) per chiedere l'autorizzazione all'uso o un accesso ufficiale in blocco, **prima del lancio pubblico**. Per sviluppo locale e test non è bloccante. Decisioni per te: (a) confermi la fonte live con queste tutele; (b) vuoi che ti prepari una bozza della richiesta al ministero?

### 8. Prezzi anomali residui
Ho corretto i segnaposto evidenti (1.000 €/L su prodotti premium: il prodotto base ha ora la precedenza e benzina/gasolio sotto 1.2 €/L sono scartati). Restano casi dubbi ma non impossibili, es. gasolio servito a 1.379 €/L (mediana 2.50). Un controllo *relativo* (scartare i prezzi molto lontani dalla mediana locale) è possibile ma è una scelta di prodotto: rischia di nascondere offerte vere. Non implemento nulla senza tua indicazione.

### 9. Prezzi in tempo reale: copertura a freddo e pre-riscaldamento — ⏸ RINVIATO (post-autorizzazione / Milestone 6)
> **Decisione (29/09/2026):** non implementare il warming job finché non arriva l'autorizzazione formale del ministero (punto 7). Da riprendere in Milestone 6 (hardening) se l'autorizzazione arriva.

La prima ricerca in una zona nuova richiede molte chiamate (Milano→Bologna: 37 riquadri, ~9 s a freddo, poi 1.2 s). Con il tetto di 10 s la ricerca risponde comunque, dichiarando «prezzi in tempo reale su N zone su M». Un job che ri-scaldi ogni ora i riquadri più richiesti (o le grandi aree urbane) risolverebbe il problema per la maggior parte delle ricerche, ma aumenta il carico sul ministero: da valutare *dopo* la risposta al punto 7.

### 10. Impianti duplicati nell'anagrafica MIMIT
Lo stesso distributore fisico può comparire con due `idImpianto` (cambio gestore): es. 57265 «01858 ENI» (AUTOSERVICE SAS, nessun prezzo) e 62820 «1858 BREGNANO» (ENIMOOV, con prezzi), stesso indirizzo. Le stazioni senza prezzi non compaiono nei risultati, quindi oggi non c'è impatto; se in futuro due duplicati avessero entrambi prezzi vedresti due card sullo stesso punto. Nessuna azione in M1; da rivalutare se emergono casi reali.

### 11. Rischio ToS Mapbox su geocoding persistente (invariato)
Se in futuro salveremo preset Casa/Lavoro, salvare solo l'indirizzo testuale (non le coordinate) evita la categoria "permanent geocoding". Non ho letto i ToS legali riga per riga: verifica formale consigliata prima del lancio pubblico. Non bloccante per l'MVP.

---

## Emersi in Milestone 2 (Risultati & Mappa)

### 12. «Sul percorso»: che ordinamento è? — ✅ RISOLTO (distanza laterale, poi ordine di incontro)
> **Decisione finale (30/09/2026):** ordinamento **primario per distanza laterale dal tracciato crescente** (le stazioni realmente sulla strada per prime), **secondario per ordine di percorrenza** (`alongRouteKm` crescente), **terziario per risparmio netto**. Title del chip: «Stazioni sulla strada, in ordine di incontro». Logica in `packages/core` (`sortResults`), con test su tracciato lineare, a «U», con verso invertito e sulla precedenza della distanza laterale. Sostituisce la decisione precedente («solo ordine di percorrenza»).
>
> **Nota sul criterio secondario:** la distanza laterale arriva dall'API arrotondata a 10 m, quindi due stazioni hanno quasi sempre distanze diverse e l'ordine di incontro interviene solo nei pareggi reali (stazioni affacciate sullo stesso punto, o a 0,00 km). Se vuoi che l'ordine di incontro conti di più, si può raggruppare la distanza in fasce (es. 100 m: dentro la fascia vale l'ordine di percorrenza). Non l'ho fatto perché la decisione era un'altra: dimmi se la vuoi.
>
> Il testo qui sotto è la domanda originale.

Il PRD elenca «Sul percorso» tra gli ordinamenti senza definirlo. **Provvisorio:** distanza laterale dal tracciato crescente (le stazioni più «sulla strada»), a parità decide il risparmio. Alternativa: ordine di percorrenza (dalla prima che incontri alla più lontana da casa). Nota: il mockup mostra «Miglior tempo» al posto di «Sul percorso»; ho seguito PRD e DESIGN.md. Quale preferisci?

### 13. «Autostrada & Extraurbane»: l'etichetta promette più di quanto il dato consenta — ✅ RISOLTO (rinominata «Autostrada»)
> **Decisione:** la pill si chiama **«Autostrada»** e filtra per `Tipo Impianto = Autostradale`. Aggiornati label, test, PRD e documentazione. Il testo qui sotto è la domanda originale.

`Tipo Impianto` vale solo `Stradale` o `Autostradale`: non esiste un attributo «extraurbana». **Provvisorio:** la pill, con l'etichetta richiesta, mostra solo gli impianti `Autostradale` (~540). **Raccomando** di rinominarla «Autostrada» per non promettere ciò che non possiamo filtrare. Confermi?

### 14. «Solo Self» come filtro sui risultati già caricati
Il filtro lavora sui risultati ricevuti, senza nuova chiamata. Se la ricerca era già «Solo Self» (default) la pill è attiva e **bloccata**: non ci sono stazioni solo servito da mostrare. Per vedere anche i servito bisogna rifare la ricerca da «Cerca» con l'interruttore spento. Va bene, o vuoi che la pill rilanci la ricerca? (collegato al punto 6)

### 15. Definizione di «Migliore»
**Provvisorio:** la stazione con il maggior risparmio netto tra quelle visibili con i filtri attivi, indipendentemente dall'ordinamento scelto, e solo se il risparmio è positivo. Con «Minor deviazione» la card «Migliore» può quindi non essere la prima.

### 16. Difformità tra `DESIGN.md`, PRD e mockup: cosa ho scelto
- **Chip inattivi:** le Rendering Rules (che prevalgono) dicono `bg-surface-container-low` senza bordo; la sezione Components dice bordo `outline-variant`. Ho seguito le Rendering Rules, anche per le pill secondarie (attive `bg-primary`, non il tono chiaro del mockup).
- **Raggio del foglio:** `rounded-t-3xl` (Rendering Rules e tua richiesta), non `rounded-xl` come scritto nella prosa e nel mockup.
- **Rimossi perché non derivabili dai dati:** «Aperto ora», riferimento «Uscita A1», pulsante traffico e link «Note legali». Il badge ambra «ritardo» resta non implementato (punto 2).
- **Barra di navigazione:** solo «Cerca» e «Risultati». «Percorso» (Screen 4) è sospesa e «Impostazioni» (Screen 5) arriva in M4.
- **Info:** il dettaglio stazione è Screen 3 (M3). Per ora «Info» apre solo il menu «Apri in navigatore» (Google Maps, Apple Maps, Waze) con prezzo e risparmio; «Naviga» apre direttamente Apple Maps su iOS e Google Maps su Android, il menu altrove.

### 17. Contrasto WCAG del verde e dell'azzurro di brand — ✅ RISOLTO per il verde (opzione b); azzurro e 14px in 21
> **Decisione:** opzione **(b)**. Regola aggiunta a `DESIGN.md` (Rendering Rules → Colors): testo piccolo (<14px) su sfondo chiaro in `text-on-primary-fixed-variant` (#005137) al posto di `text-primary`; fill e contenitori restano `bg-primary`. Applicata a tutti i testi piccoli del web (risparmio nelle card, conteggio nella capsula, etichetta attiva della barra, «Ripristina», risparmio nel foglio Info), con un test che vieta `text-primary` sotto i 14px.

Lighthouse segnala `color-contrast`: `#059669` su bianco = 3,76:1 e `#0284C7` su tinta chiara = 3,6:1, sotto i 4,5:1 richiesti per il testo piccolo (AA). Sono i colori mandatori di `DESIGN.md`, quindi non li ho toccati. Opzioni: **(a)** accettare (i testi grandi/bold passano); **(b)** per il testo piccolo usare `on-primary-fixed-variant` (#005137) su tinta chiara, mantenendo `#059669` per i riempimenti; **(c)** scurire il primario. **Raccomando (b)**: decisione di design, tua.

### 18. Contratto API: aggiunto `route.geometry` alla risposta di `POST /search`
Per disegnare il percorso la mappa ha bisogno del tracciato, che la risposta non conteneva. Ho aggiunto **solo** il campo `route.geometry` (tracciato semplificato ~50 m, coordinate a 5 decimali, ~1–2 punti per km): è additivo e non tocca la logica di ricerca. L'alternativa (chiamare Directions dal browser) avrebbe raddoppiato i costi e aggirato il kill switch. Da confermare, visto che chiedevi di non modificare il backend di M1.

### 19. Ricerca a schede: prime 20 e «Mostra altre»
L'elenco mostra le prime 20 schede (mappa e filtri lavorano su tutte le stazioni, fino a 50) per contenere il costo di rendering sui telefoni. Toccando sulla mappa un pin oltre la ventesima l'elenco si estende fino a quella stazione.

### 20. Hosting: le rotte dell'app (`/results`) richiedono un rewrite
La navigazione usa rotte vere (`/`, `/results`). In produzione Vercel deve reindirizzare ogni percorso a `index.html` (rewrite SPA). Da configurare in M5/M6; in sviluppo e con `vite preview` funziona già.

### 21. Contrasto residuo: testo a 14px e azzurro `secondary` — ✅ RISOLTO in gran parte (30/09/2026); resta il bianco su `bg-primary` → M7
> **Decisione:** regola estesa a **≤14px**; testo piccolo in `secondary` su chiaro → `text-on-secondary-fixed-variant`; indirizzo e «Benzina Self» delle card da `text-outline` a `text-on-surface-variant`. Applicato a tutto il web (stepper dei litri, avatar del brand, «Naviga» non evidenziato, pill di deviazione, valore della deviazione massima, separatori della capsula) e coperto da test. **Resta accettato**, da tracciare in Milestone 7, il testo bianco su `bg-primary` (chip attivi, badge «Migliore», pin verde). Non toccato: il segnaposto dei campi di ricerca (`placeholder:text-outline`, 4,49:1). Il testo qui sotto è la segnalazione originale.

La regola confermata riguarda il testo **sotto i 14px** e il verde. Restano fuori, e Lighthouse potrebbe ancora segnalarli:
- **testo a esattamente 14px** in `text-primary` su tinta chiara: numero litri nello stepper, iniziali dell'avatar del brand, pulsante «Naviga» non evidenziato (`label-lg`);
- **testo bianco sul riempimento `bg-primary`** (chip attivi, badge «Migliore», pin verde): 3,76:1 su testo di 11–14px, ma la regola lascia i fill invariati;
- **azzurro `secondary` (#0284C7) su tinta chiara** (pill di deviazione, slider «Deviazione massima»): ~3,6:1 su testo piccolo.
- **`text-outline` (#6d7a72) su bianco**: 4,49:1, a un soffio dai 4,5:1 (riga indirizzo e etichetta «Benzina Self» nelle card); basterebbe `text-on-surface-variant`.
**Raccomando** di estendere la regola a «≤14px» e di applicare la stessa logica all'azzurro con `text-on-secondary-fixed-variant` (#004b73, già nei token). Non l'ho fatto perché la tua conferma riguardava solo il verde sotto i 14px.

### 22. Deviazione verificata: il percorso diretto è il più veloce, non il più corto — ✅ CORRETTO, da confermare la regola
**Sintomo:** la card di «1858 BREGNANO» (Ceriano Laghetto → Lomazzo, 0,8 km dal tracciato) mostrava «+0,0 km (+3 min)», e «Minor deviazione» dava lo stesso ordine di «Più conveniente».
**Causa radice:** Mapbox `driving` restituisce il percorso più *veloce*. Il diretto passa dall'A9 (15,49 km, 17,6 min); A→Bregnano→B usa strade locali (12,94 km, 20,6 min): −2,55 km, +2,93 min. Il codice faceva `max(0, ·)` su km e minuti separatamente (→ 0 km, +2,9 min). Non erano in causa proxy, arrotondamenti né il cablaggio: anche altre due stazioni verificate avevano 0,0 km, quindi il pareggio sui km riportava l'ordine per risparmio.
**Regola applicata (`computeRoutedDetour`):** km = max(differenza reale, 2 × distanza laterale, 0); minuti = min(max(differenza reale, 0), km × 6 min/km, con minimo 1 min). Il minimo `2 × laterale` è il percorso in linea retta andata e ritorno; il tetto sui minuti impedisce che ~0 km costino minuti. Sul caso reale: +1,6 km, +2,9 min.
**Da decidere (raccomandazione: tenere così):** in questi casi la stazione sul percorso alternativo farebbe *risparmiare* 2,5 km di carburante. Ho scelto di non dare credito (km ≥ minimo geometrico): è prudente, e il costo è irrilevante (0,2 € a 15 km/L). Alternative: (a) mostrare i km con segno («−2,5 km»), più fedele ma controintuitivo nella card; (b) confrontare con il percorso *più corto* invece che con il più veloce (richiede un secondo routing senza autostrada, vedi punto 23).

### 23. Autostrada nel routing: dati per decidere il toggle «evita autostrada» (M4) — ℹ️ SOLO DATI, nessun cambio di comportamento
`exclude=motorway` è **supportato** da Directions `mapbox/driving` (anche con waypoint intermedi; esiste anche `exclude=toll`). Il percorso con `steps=true` espone le classi di strada (`motorway`, `toll`) per ogni intersezione.

| Percorso | Diretta | Senza autostrada (`exclude=motorway`) |
|---|---|---|
| **Ceriano Laghetto → Lomazzo** (test) | **15,49 km, 17,6 min**, di cui **5,28 km in autostrada a pedaggio** (A9/E35: 1,7 km + 3,6 km di raccordo) | **12,50 km, 18,2 min** (−3,0 km, +0,6 min) |
| via «1858 Bregnano» | 12,94 km, 20,6 min, **nessun tratto autostradale** | identico |
| Milano Duomo → Bologna Maggiore (riferimento) | 211,0 km, 149,5 min, 198,1 km in autostrada (A1) | 255,8 km, 285,9 min (+44,8 km, +136 min) |

**Cosa implica:** sul percorso di test l'A9 fa guadagnare 0,6 min ma costa 3 km e un pedaggio; la stazione di Bregnano è «fuori dal tracciato» proprio perché il diretto prende l'autostrada, mentre il percorso che passa dalla stazione non la usa (da qui il punto 22). Con «evita autostrada» attivo la deviazione andrebbe misurata contro il diretto *senza* autostrada (qui 12,50 km/18,2 min → Bregnano costerebbe +0,44 km, +2,4 min) e il pedaggio oggi non entra in `S_net`. Suggerisco per M4: toggle che passa `exclude=motorway` sia al diretto sia alle verifiche, e il tragitto senza autostrada come baseline di deviazione; il pedaggio resta fuori dalla formula finché non c'è un dato (Mapbox non dà l'importo).

### 24. Stile della mappa e lingua delle etichette — ✅ SCELTO
Basemap Standard, tema `monochrome`; `language` non è una config di Standard (schema ufficiale letto dall'API degli stili), si usa l'opzione `language: "it"` di `mapboxgl.Map`. `VITE_MAPBOX_STYLE_URL` permette di sostituire lo stile senza toccare il codice; lo stile di brand si disegna a mano in Studio in M7. Motivazione del tema in `PLAN.md` (M2, decisione 10).

### 25. Percorso con sosta: costo e limiti
Il tracciato A→stazione→B viene richiesto alla selezione di una stazione. Per le prime 5 è già in cache (10 min), per le altre è **una chiamata Directions** in più (con kill switch e limite di 30 richieste/minuto per IP); il client ricorda le risposte per ricerca, quindi riselezionare non rifà la chiamata. Se il routing non è disponibile non si disegna nulla. Raccomando di tenerlo così; se preferisci, il disegno si può limitare alle sole stazioni verificate.
