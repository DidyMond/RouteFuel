# Open Questions — dopo la Milestone 1

> Milestone 1 **confermata e integrata in `main`** (29/09/2026). Stato dei punti: **7** in attesa risposta ministero · **9** rinviato · gli altri restano aperti con la raccomandazione indicata (procedo con quella se non indichi diversamente).

Le decisioni della checklist pre-M0 (stack, mapping carburanti, cascata `P_avg`, `C_km`, semantica della deviazione, strategia ibrida, Self/Servito, default, rimozione dei dati non disponibili) sono **confermate** e implementate: il dettaglio è in `PLAN.md`. Il repository GitHub è configurato (`origin`).

Qui restano i dubbi emersi durante l'implementazione di M1. Per ciascuno c'è una raccomandazione: se non indichi diversamente, procedo con quella.

---

## Azione a tuo carico

### A. Token Mapbox dedicato al server
Il token di default dell'account è stato incollato in chat e non ha restrizioni: va considerato esposto. Per M1 serve **un solo token, lato server** (`MAPBOX_SERVER_TOKEN`). Raccomando di crearne uno nuovo e dedicato (istruzioni nel riepilogo di M1) e, quando arriverà la mappa in M2, di **ristringere per URL** il token di default (o sostituirlo) prima che finisca in un bundle pubblico. Non blocca i test locali.

---

## Da decidere

### 1. Contraddizione in `DESIGN.md`: stile dei campi di input
La prosa (§ Input Fields) dice altezza 44 px, sfondo `#F1F5F9`, raggio `0.75rem`; le *Rendering Rules* (che dichiarano di prevalere) dicono che gli input sono `rounded-DEFAULT` (1rem), e `#F1F5F9` non è un token. **Ho applicato le Rendering Rules:** 44 px, `bg-surface-container-low`, raggio 1rem. Confermi?

### 2. `DESIGN.md`: colori citati solo nella prosa, non tra i token
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
