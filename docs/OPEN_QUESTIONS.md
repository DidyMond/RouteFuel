# Open Questions — dopo la Milestone 1

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

### 7. I prezzi MIMIT hanno per costruzione 1–2 giorni di ritardo
Verificato il 28/09/2026: il file `prezzo_alle_8.csv` viene rigenerato ogni mattina (~07:09 UTC, `Last-Modified` del server), ma contiene lo stato **alle 08:00 del giorno precedente** (intestazione `Estrazione del 2026-09-27`, ultimo `dtComu` = 27/09 08:00). Lo conferma la pagina MIMIT: «vengono pubblicate le informazioni in vigore alle ore 8 del giorno precedente a quello di pubblicazione». Non è un file bloccato: il ritardo è strutturale, da ~24 h (subito dopo la pubblicazione) a ~48 h (poco prima della successiva). Alle 23:15 del 28/09 i dati avevano ~39 h.

Conseguenze: un prezzo può essere cambiato nelle ultime 24–48 h; la soglia di freschezza (72 h dal `dtComu`) va letta sapendo questo. Opzioni:
- **(a)** lasciare tutto com'è e **mostrare in UI la data dei dati** («Prezzi in vigore alle 8:00 del 27 set») e nel README che sono indicativi; salvare in DB la data di `Estrazione del` (oggi viene letta ma non conservata);
- **(b)** come (a), ma calcolare l'età di un prezzo rispetto all'estrazione e non a «adesso»;
- **(c)** cercare una fonte in tempo reale. L'API `OssPrezziSearch` del YAML di `teamdigitale/api-openapi-samples` è il backend del sito web, non un'API pubblica supportata: l'esempio è del 2019 e oggi `POST /ricerca/position` risponde `302 → /ospzSearch` (il sito è stato rifatto). Ha un endpoint per percorso, ma è interrogabile solo a richieste singole, senza contratto, licenza né SLA: sarebbe fragile e a rischio blocco/ToS. **Non la consiglio come fonte primaria.**

**Raccomando (a)**, con (b) valutabile in M2. Il CSV resta la fonte ufficiale, stabile e con licenza aperta.

### 8. Impianti duplicati nell'anagrafica MIMIT
Lo stesso distributore fisico può comparire con due `idImpianto` (cambio gestore): es. 57265 «01858 ENI» (AUTOSERVICE SAS, nessun prezzo) e 62820 «1858 BREGNANO» (ENIMOOV, con prezzi), stesso indirizzo. Le stazioni senza prezzi non compaiono nei risultati, quindi oggi non c'è impatto; se in futuro due duplicati avessero entrambi prezzi vedresti due card sullo stesso punto. Nessuna azione in M1; da rivalutare se emergono casi reali.

### 9. Rischio ToS Mapbox su geocoding persistente (invariato)
Se in futuro salveremo preset Casa/Lavoro, salvare solo l'indirizzo testuale (non le coordinate) evita la categoria "permanent geocoding". Non ho letto i ToS legali riga per riga: verifica formale consigliata prima del lancio pubblico. Non bloccante per l'MVP.
