# Open Questions

> Milestone 0, 1 e 2 **confermate e integrate in `main`** (M2: 30/09/2026). Restano aperti i punti **7** e **11** e, dalla Milestone 4, i punti **M4·1–5** (interpretazioni da confermare); tutto il resto è in «Decisioni risolte» in fondo.

---

## Aperti

### 7. Fonte dei prezzi in tempo reale: non è un'API pubblica — ⏳ IN ATTESA RISPOSTA MINISTERO
> **Decisione (29/09/2026):** la mail a `osservaprezzi@mise.gov.it` la invia il product owner. Nel frattempo la fonte live resta **best effort** con fallback dichiarato al CSV. Nessuna estensione del carico sul ministero (niente warming job, vedi punto 9) finché non c'è l'ok formale.

Il CSV MIMIT ha 1–2 giorni di ritardo per costruzione («informazioni in vigore alle ore 8 del giorno precedente»), quindi per avere prezzi aggiornati M1 interroga anche il **sito ufficiale** Osservaprezzi (`POST carburanti.mise.gov.it/ospzApi/search/zone`, lo stesso endpoint che alimenta la ricerca per zona del sito). Funziona, ma:
- **non è documentata né garantita**: nessun SLA, nessuna licenza d'uso esplicita per applicazioni terze, il formato può cambiare senza preavviso (l'endpoint del 2019 nel repository `teamdigitale/api-openapi-samples` oggi risponde `302`);
- **ha un limite di richieste**: ho ricevuto HTTP 429 dopo ~80 richieste in pochi minuti con 6 in parallelo (mie prove di carico). Il client ora usa concorrenza 3, cache per riquadro da 60 minuti, pausa su 429 e tetto di 40 riquadri per ricerca;
- se il servizio è indisponibile la ricerca degrada al CSV e lo dichiara in UI.

**Raccomando** di scrivere a `osservaprezzi@mise.gov.it` (contatto indicato nella descrizione dell'API) per chiedere l'autorizzazione all'uso o un accesso ufficiale in blocco, **prima del lancio pubblico**. Per sviluppo locale e test non è bloccante. Decisioni per te: (a) confermi la fonte live con queste tutele; (b) vuoi che ti prepari una bozza della richiesta al ministero?

### 11. Rischio ToS Mapbox su geocoding persistente (invariato)
Se in futuro salveremo preset Casa/Lavoro, salvare solo l'indirizzo testuale (non le coordinate) evita la categoria "permanent geocoding". Non ho letto i ToS legali riga per riga: verifica formale consigliata prima del lancio pubblico. Non bloccante per l'MVP.

### M4·1. Prezzo di riferimento manuale con il campo vuoto (M4)
In modalità «Manuale» il valore vale solo per i carburanti che hanno un numero: un carburante lasciato vuoto usa il calcolo automatico (i campi vuoti mostrano «auto»). L'alternativa è obbligare a compilare tutti e quattro i carburanti. **Raccomando** di tenere così: chi cerca un carburante diverso dal solito non resta senza riferimento. Confermi?

### M4·2. Salvataggio esplicito invece che automatico (M4)
Come nel mockup, le modifiche stanno in una bozza e si applicano con «Salva Preferenze»; «Ripristina Predefiniti» invece salva subito i valori di fabbrica. Uscire dalla schermata senza salvare scarta la bozza (senza avviso). **Raccomando** di tenere così; se preferisci il salvataggio a ogni modifica o un avviso di uscita, è una modifica piccola.

### M4·3. Intervalli di validazione (M4)
Nell'interfaccia: V_time 0,05–1,00 €/min (da PLAN), consumo 3–40 km/L, serbatoio 5–120 L, soglia di freschezza 1–720 ore (intero), prezzo manuale 0,5–4 €/L. Il backend accetta ancora V_time da 0 a 2 (retrocompatibile) e rifiuta un prezzo manuale fuori da 0,5–4 €/L. **Raccomando** di tenere così. Confermi?

### M4·4. «Evita autostrada» è una preferenza globale (M4)
L'interruttore sta solo in Impostazioni e vale per tutte le ricerche successive; non c'è un interruttore nel form di ricerca. Una ricerca già fatta conserva il suo valore (e il badge nei Risultati lo mostra) anche se poi si cambia l'impostazione. **Raccomando** di tenere così fino alla Home di M7. Confermi?

### M4·5. Carrozzeria e modello non entrano nel calcolo (M4)
Il profilo veicolo salva carrozzeria e modello come promemoria dell'utente, ma l'algoritmo usa solo serbatoio (precompila «Litri»), carburante e consumo: non ho dati MIMIT né fonti per stimare consumi dal modello, quindi non lo invento. **Raccomando** di tenere così. Confermi?

---

## Decisioni risolte

- **A. Token Mapbox pubblico per il browser** — chiuso (token `routefuel-web` creato). In checklist M5/M6: restrizione URL sul dominio di produzione e avviso di spesa nel pannello Mapbox.
- **1. Stile dei campi di input** — seguono le Rendering Rules di `DESIGN.md` (raggio 1rem, `bg-surface-container-low`, altezza 44 px).
- **2. Colori citati solo nella prosa di `DESIGN.md`** — mappati sui token esistenti, nessun nuovo colore; il badge ambra «ritardo» non è implementato.
- **3. Il proxy sottostima** — opzione **(b)**: verifica col routing reale finché la testa dell'elenco non ha 5 stazioni confermate, con tetto di 10 chiamate extra per ricerca (`REFINE_EXTRA_CALLS_CAP`); oltre il tetto restano le stime con il badge «stima». Implementato e testato.
- **4. Ricerca di luoghi (POI)** — opzione **(a)**: solo indirizzi e località per l'MVP.
- **5. Geocoding tramite il backend** — confermato il proxy dell'API.
- **6. Posizione del toggle «Solo Self»** — resta come implementato (toggle nel form della Home, pill in Screen 2); si rivede in M7.
- **8. Prezzi anomali residui** — nessun controllo relativo sulla mediana nell'MVP.
- **9. Prezzi live: pre-riscaldamento a freddo (warming job)** — rinviato a M6, dopo l'autorizzazione formale del ministero (punto 7).
- **10. Impianti duplicati nell'anagrafica MIMIT** — nessuna azione, si monitora.
- **12. «Sul percorso»** — superato: il chip è stato **rimosso** da Screen 2. Restano «Più conveniente» e «Minor deviazione» (km extra verificati, proxy se manca la verifica; spareggi: distanza laterale, ordine di incontro, risparmio netto). Il terzo ordinamento «Miglior tempo» del mockup è in backlog M7.
- **13. Etichetta «Autostrada & Extraurbane»** — la pill si chiama «Autostrada» e filtra per `Tipo Impianto = Autostradale`.
- **14. «Solo Self» come filtro sui risultati** — resta come implementato (pill attiva e bloccata con tooltip se la ricerca era già «Solo Self»); si rivede in M7.
- **15. Definizione di «Migliore»** — confermata: maggior risparmio netto tra le stazioni visibili, solo se positivo.
- **16. Difformità tra `DESIGN.md`, PRD e mockup** — confermate tutte le scelte fatte.
- **17. Contrasto WCAG del verde** — opzione **(b)**: testo piccolo in `text-on-primary-fixed-variant`, fill invariati; regola in `DESIGN.md`.
- **18. `route.geometry` nella risposta di `POST /search`** — confermato.
- **19. Elenco a schede (prime 20 + «Mostra altre»)** — confermato.
- **20. Rewrite SPA su Vercel per `/results`** — rinviato a M5/M6.
- **21. Contrasto residuo** — chiuso: regola estesa a ≤14px (verde e azzurro → varianti `on-*-fixed-variant`, `text-outline` → `text-on-surface-variant` nelle card). I due residui (bianco su `bg-primary`; placeholder `text-outline`) sono nel backlog M7.
- **22. Deviazione verificata (diretto = percorso più veloce)** — regola confermata: km ≥ 2 × distanza laterale, minuti limitati dai km extra (causa radice e dettagli in `PLAN.md`, M2, decisione 7).
- **23. Autostrada nel routing** — chiuso come dati (tabella in `PLAN.md`, M4). In M4: toggle «Evita autostrada» con `exclude=motorway` applicato sia al diretto sia alle verifiche; il pedaggio resta fuori da `S_net`.
- **24. Stile mappa e lingua** — Standard `monochrome`, etichette in italiano con l'opzione `language` di Map, `VITE_MAPBOX_STYLE_URL` per sostituire lo stile; stile di brand in M7.
- **25. Percorso con sosta: costo e limiti** — confermato (cache, una chiamata Directions per le stazioni non verificate, kill switch, 30 richieste/minuto).
- **M3·12. «Verificato MISE» (Screen 3)** — risolto: il badge attribuisce i **prezzi** alla fonte ufficiale Osservaprezzi (MISE) e sta nell'header del «Listino carburanti»; non compare nella meta stazione. La verifica del **percorso** è di Mapbox Directions ed è etichettata come tale nel tile «Deviazione»: «Percorso verificato» (`detourSource = routing`) oppure «Stima geometrica» (`proxy`), ciascuna con tooltip. Una stima non è mai presentata come verificata e l'informazione non sparisce mai.
- **M3·13. Deep-link del navigatore** — risolto: restano i link https (Apple Maps, Google Maps, Waze). «Apri nel Navigatore» apre **sempre** il menu: l'app predefinita del sistema (Apple Maps su iOS, Google Maps su Android) è in prima posizione con l'etichetta «Consigliato», le altre sotto; un tap sul consigliato equivale al lancio diretto. Nessun pulsante secondario.
- **M3·14. Tap sulla scheda in Screen 2** — risolto: il tap sulla scheda **seleziona** la stazione (pin evidenziato e percorso con sosta verde, come in M2); il dettaglio si apre **solo** da «Info».
- **M3·15. Matrice prezzi** — risolto: il listino mostra solo i quattro carburanti MVP e i prezzi entro la soglia di freschezza della ricerca (HVO e carburanti non classificati esclusi).
