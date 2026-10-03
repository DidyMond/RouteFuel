# Open Questions

> Milestone 0, 1 e 2 **confermate e integrate in `main`** (M2: 30/09/2026). Restano aperti solo i punti **7** e **11**; tutto il resto, comprese le interpretazioni della Milestone 4 (chiuse il 03/10/2026), è in «Decisioni risolte» in fondo.

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
- **M4·4. «Evita autostrada» come preferenza globale** — **sorpassata dal PO (02/10/2026, punto 4):** le Impostazioni restano il default globale, ma nella Home c'è uno switch «Evita autostrada» accanto a «Solo Self», precompilato dal default e inviato con ogni ricerca; nei Risultati si cambia con «Opzioni percorso».
- **Revisione funzionale M4 (PO, 02/10/2026), decisioni 1–6:**
  1. **Accordion** — tutte e quattro le sezioni di `/settings` chiuse al caricamento (chevron e `aria-expanded` coerenti).
  2. **«Valore del tuo tempo»** — niente cifra digitata come input primario: chip nominati **Solo denaro** (0 €/h, il tempo non entra in `S_net`), **Tranquillo** (6 €/h ≈ €0,10/min), **Bilanciato** (9 €/h ≈ €0,15/min, default), **Ho fretta** (15 €/h ≈ €0,25/min), **Personalizzato** (slider 3–60 €/h, passo 1, visibile solo se selezionato). Si salva sempre in €/min (preset ÷ 60), validazione 0,00–1,00 €/min; «Ripristina Predefiniti» → «Bilanciato». La configurabilità del PRD è preservata, cambia la presentazione.
  3. **«Consumi e Carburante»** allineato al mockup 5 — slider 3–40 km/L (passo 0,5), pill del valore, «Ripristina» a 15, caption «8 Sport · 15 Medio · 30 Eco», costo/km dinamico (riferimento manuale se attivo, altrimenti ultimo automatico, «—» se nessuno).
  4. **Default e per-ricerca** — switch «Evita autostrada» nella Home accanto a «Solo Self»; nuova impostazione «Cerca solo stazioni Self per impostazione predefinita» (default ON) che precompila «Solo Self»; il default resta globale nelle Impostazioni.
  5. **Opzioni percorso stile Google Maps** — chip-pulsante nei Risultati al posto del banner, foglio con Evita autostrade / pedaggi / traghetti, «Applica» (rilancia `POST /search` con lo stesso A/B) e «Reimposta» (default delle Impostazioni); default dei tre toggle nelle Impostazioni (Accordion 3). **Verificato che Mapbox Directions `mapbox/driving` supporta `exclude=toll` e `exclude=ferry`** (combinabili con la virgola) quindi implementati, con l'insieme di esclusioni nella chiave di cache e la baseline della deviazione sempre contro il diretto con lo stesso insieme. Il pedaggio resta fuori da `S_net` (nessun dato di costo). Nella Home restano solo gli switch «Solo Self» ed «Evita autostrada»: pedaggi e traghetti dalle Opzioni nei Risultati o dai default.
  6. **Pill «Autostrada»** — disabilitata (grigia) con tooltip «Non disponibile con Evita autostrada» quando la ricerca attiva evita le autostrade; se era attiva e una nuova ricerca o le opzioni le evitano, si disattiva da sola. **Nessun auto-disable per evita-pedaggi** (né traghetti): il filtro Tipo Impianto è dato-indipendente dal tracciato.
- **Chiusura M4 (PO, 03/10/2026) — interpretazioni M4·1–3 e M4·5–9 confermate come implementate:**
  - **M4·1** — in «Manuale» un carburante con il campo vuoto usa il calcolo automatico (i campi vuoti mostrano «auto»).
  - **M4·2** — salvataggio esplicito: bozza + «Salva Preferenze»; «Ripristina Predefiniti» salva subito i valori di fabbrica; uscire senza salvare scarta la bozza.
  - **M4·3** — intervalli di validazione (UI e API): V_time 0,00–1,00 €/min, consumo 3–40 km/L, serbatoio 5–120 L, deviazione massima 1–10 km, soglia di freschezza 1–720 ore (intero), prezzo manuale 0,5–4 €/L.
  - **M4·5** — carrozzeria e modello sono promemoria dell'utente e non entrano nel calcolo.
  - **M4·6** — il carburante predefinito resta in «Profilo Veicolo» (il mockup 5 lo mette in «Consumi e Carburante»).
  - **M4·7** — gli switch della Home («Solo Self», «Evita autostrada») partono dai default all'apertura e a ogni cambio delle Impostazioni; la modifica per-ricerca resta nel form finché non si ricarica la pagina o cambiano le Impostazioni.
  - **M4·8** — «Applica» nelle Opzioni percorso rilancia la ricerca con la stessa richiesta e il nuovo insieme di esclusioni; filtri e ordinamento ripartono puliti; pedaggi e traghetti scelti nel foglio valgono solo per quella ricerca e non diventano preferenza.
  - **M4·9** — «Personalizzato» (valore del tempo) è uno stato dell'interfaccia non salvato; da «Solo denaro» lo slider parte da 3 €/h.
- **Chiusura M4 (PO, 03/10/2026) — nuovo campo «Deviazione massima predefinita»:** slider 1–10 km (passo 1, valore di fabbrica 5) in «Algoritmo & Filtri»; precompila lo slider della Home a ogni nuova ricerca (e quando le Impostazioni cambiano), resta modificabile per ricerca; persistito in `routefuel.settings.v1`, presente in `sanitizeSettings`, `FACTORY_SETTINGS` e `samePreferences`; «Ripristina Predefiniti» → 5. Stesso intervallo dello schema API (1–10, `DETOUR_RANGE`).
- **Chiusura M4 (PO, 03/10/2026) — pannello «Consumi e Carburante»:** tre tacche sotto lo slider distribuite con `justify-between` («8 Sport», «15 Medio», «30 Eco»); «Ripristina» accanto alla pill del valore nella riga intestazione; la riga «ultimo riferimento automatico…/riferimento manuale…» è sostituita da un tooltip sul valore «Costo / km» (es. «calcolato da €1,999/L (ultimo riferimento automatico Benzina) ÷ 15,0 km/L»), resta visibile solo «nessun prezzo di riferimento noto» quando il costo mostra «—»; passo dello slider 0,1 km/L (`CONSUMPTION_SLIDER.step`).
- **M4·10. «Soglia risparmio minimo» (mockup 5) — FUORI MVP:** non implementata. `S_net` resta l'unico criterio di ordinamento delle stazioni; da rivalutare dopo il lancio con i dati d'uso.
- **M4·11. «Toggle costo deviazione chilometrica» (mockup 5) — FUORI MVP:** non implementato. `C_km` resta sempre attivo nella formula (decisione vincolante pre-M0); nessun toggle.
