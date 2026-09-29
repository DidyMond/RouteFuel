# Product Requirements Document (PRD)
## RouteFuel — Piattaforma di Navigazione e Ottimizzazione Rifornimenti

---

### 1. Executive Summary & Visione

**RouteFuel** è una web application mobile-first di routing intelligente e ottimizzazione carburante, progettata per eliminare l'ansia da prezzo del carburante per automobilisti quotidiani, pendolari e viaggiatori di lungo percorso. Combinando i dati aperti ufficiali del governo italiano (MIMIT / Osservaprezzi Carburanti, pubblicati come due file CSV aggiornati ogni giorno alle 08:00) con la telemetria dinamica del percorso, RouteFuel non calcola solo il distributore più economico vicino al guidatore, ma la sosta matematicamente ottimale lungo l'intera traiettoria — tenendo conto di distanza di deviazione, ritardo di viaggio, consumo aggiuntivo e modalità di erogazione (Self vs Servito).

---

### 2. Problem Statement & Pain Point degli Utenti

- **Prezzo gonfiato in autostrada**: le stazioni di servizio in autostrada applicano frequentemente fino al 15–25% in più per litro rispetto alle stazioni regionali situate a 500m–1km dall'uscita.
- **Paradosso della deviazione**: i guidatori spesso percorrono diversi chilometri fuori strada per risparmiare €0,05/L, consumando involontariamente più carburante e tempo di quanto risparmino davvero.
- **Dati crowd stantii o non verificati**: molte app di navigazione si basano su segnalazioni degli utenti vecchie di giorni o settimane.
- **Decisioni complesse in veicolo**: durante la guida o la preparazione di un viaggio, calcolare se una deviazione di 1,2 km / 3 minuti conviene su un pieno da 50 litri è mentalmente estenuante.

---

### 3. Target Audience & Personas

1. **Pendolari giornalieri e regionali** (persona prioritaria MVP):
   - Percorrono 40–120 km al giorno lungo corridoi autostradali o statali (es. Milano–Bologna, Roma–Firenze).
   - Amano coerenza, ricerca rapida da preset casa/lavoro e avvisi automatici sul percorso.
2. **Viaggiatori lunghi / vacanzieri**:
   - Viaggi a lunga distanza con pieni completi (45–70 litri).
   - Alta sensibilità al risparmio totale sul viaggio (€15–25 per singolo pieno).
3. **Fleet / conducenti commerciali leggeri** (post-MVP):
   - Corrieri indipendenti e agenti di commercio che cercano ricevute documentate e verificabili e spese operative prevedibili.

---

### 4. Core Value Proposition & Formula Chiave

RouteFuel classifica le stazioni lungo il percorso secondo il **Net Savings Index (S_net)**:

```
S_net = (P_avg − P_station) × V_refill − (D_detour × C_km) − (T_detour × V_time)
```

Dove:
- `P_avg`: prezzo medio del carburante lungo il percorso non modificato.
- `P_station`: prezzo effettivo della stazione per il tipo di carburante e la modalità di erogazione selezionati.
- `V_refill`: volume di rifornimento del serbatoio del veicolo utente (es. 50L).
- `D_detour`: distanza di deviazione aggiuntiva andata/ritorno (km).
- `C_km`: costo marginale reale per chilometro basato su consumo del veicolo e costo carburante.
- `T_detour`: tempo di guida aggiuntivo (minuti).

**Configurabilità**: `P_avg` e `V_time` sono parametri configurabili (default dal profilo veicolo/impostazioni, con override per singola ricerca). `V_refill` ha come default la capacità del serbatoio dal profilo veicolo.

---

### 4.1 MVP Scope Boundaries (vincolanti)

- **Piattaforma**: webapp responsive/PWA first; app native post-MVP.
- **Routing e mappe**: provider esterno (Google Maps vs Mapbox vs alternative open da valutare) dietro interfaccia RoutingProvider; nessun motore di routing proprietario.
- **Esclusi dal MVP**: autenticazione, pagamenti, push notifications, Screen 4 (Modifica Percorso), funzionalità fleet.
- **Dati carburante**: sola ingestione dei CSV MIMIT; niente prezzi crowdsourced nel MVP (la UI di segnalazione può raccogliere segnali ma non pubblicarli).
- **Persona prioritaria**: pendolari giornalieri e regionali.

---

### 5. Information Architecture & Core Screens

Il prodotto consiste di 5 screen mobile dedicati, supportati da un design system unificato e navigazione tab floating:

#### Screen 1: Home & Ricerca Percorso (`/home`)
- **Header**: header pulito ad alto contrasto con mark vettoriale ufficiale a gradiente, wordmark dell'app e avatar profilo utente.
- **Pannello di ricerca ("Pianifica Viaggio & Risparmio")**:
  - Input Origine (A) e Destinazione (B) collegati con swap di posizione in un tap.
  - Pill scorciatoie: *Posizione attuale*, *Lavoro*, *Casa*.
- **Controlli rapidi & opzioni**:
  - Chip di selezione multi-carburante (*Benzina*, *Diesel*, *GPL*, *Metano*).
  - Stepper volume serbatoio (es. 45–50 L).
  - Override consumo veicolo con reset al profilo.
  - Slider tolleranza deviazione massima (da 1 km a 10 km).
- **Viaggi recenti e frequenti**: card ad accesso istantaneo con metriche percorso cached e badge prezzo.

#### Screen 2: Risultati & Mappa Distributori (`/results`)
- **Viewport mappa (40% del viewport)**:
  - Linea percorso vettoriale con styling direzionale.
  - Pin a bolla di prezzo sfalsati e non sovrapposti, con highlight smeraldo sulla stazione ottimale.
  - Capsula telemetria live (distanza percorso, durata totale, stazioni trovate).
- **Bottom sheet scorrevole interattivo**:
  - Filtri di ordinamento rapidi: *Più conveniente*, *Minor deviazione*, *Sul percorso*.
  - Pill filtri secondari: *Solo Self*, *Aperto ora*, *Autostrada*.
  - Card stazioni classificate con:
    - Avatar brand stazione, nome, riferimento uscita e badge "Migliore".
    - Prezzo per litro prominente con cifre tabulari (`font-variant-numeric: tabular-nums`).
    - Metriche deviazione (`+0.4 km (+1m)`) e pill risparmio stimato (`Risparmi ~€15.80`).
    - Azioni dirette: *Info* (apre Dettaglio) e *Naviga* (lancia navigazione esterna).
- **Banner fonte dati**: etichetta di verifica open-data MIMIT Osservaprezzi con timestamp di ingestione.

#### Screen 3: Dettaglio Stazione Carburante (`/station-detail`)
- **Navigazione stack**: header safe-area aware con back button, brand mark, azioni bookmark e share.
- **Meta stazione**: badge brand, indirizzo completo con copia negli appunti, stato 24/7, sigillo di verifica.
- **Pill uscita consigliata**: uscita autostradale esatta e distanza dalla rampa (es. *A1 Piacenza Sud, 350m*).
- **Bento grid impatto viaggio**:
  - Impatto deviazione: `0.4 km` / `+1 min guida`.
  - Risparmio netto: `€15.80` su pieno da 50L.
  - Differenziale: `-€0.18/L` vs media corridoio (-9.6%).
- **Matrice prezzi carburanti**: card per prezzi Self e Servito su Benzina e Diesel.
- **Nota dati (vincolante)**: numeri pompa, servizi (bar, autolavaggio, bagni, ecc.) e consiglio community NON sono disponibili nei CSV MIMIT: nel mockup sono placeholder; l'implementazione è subordinata a una futura fonte dati oppure vanno rimossi.
- **Azione bottom floating**: container con progressive blur e CTA primaria ad alto impatto: *Apri nel Navigatore* (Google Maps / Apple Maps / Waze).

#### Screen 4: Modifica Percorso & Tappe (`/route-edit`) — POST-MVP, SOSPESO
Sospeso in attesa di decisione architetturale (probabile assorbimento in Risultati come percorsi alternativi + drag dei marker). Fuori dallo scope MVP: tenuto qui solo come riferimento di visione.
- Header mappa interattiva con overview percorso e badge waypoint riordinabili.
- Lista sequenza waypoint con nodi trascinabili (Origine A, soste carburante intermedie, aree riposo, Destinazione B).
- Telemetria per tratta: distanza, durata, stima carburante residuo.
- CTA aggiunta waypoint intermedio.
- Bento impatto cumulativo percorso: delta tempo totale, delta distanza totale, risparmio monetario netto.
- Azioni sticky: dock a doppio pulsante (*Calcola & Salva Percorso* / *Annulla modifiche*).

#### Screen 5: Impostazioni & Veicolo (`/settings`)
- **Accordion 1 — Profilo Veicolo**:
  - Tile selezione carrozzeria (*Berlina*, *SUV*, *Wagon*, *Moto*, *Furgone*).
  - Input nome modello veicolo (*Nome & Allestimento*).
  - Stepper capacità serbatoio con controlli circolari `+/-` e indicatore pill.
- **Accordion 2 — Consumi e Carburante**:
  - Chip tipo carburante predefinito.
  - Slider consumo combinato (km/L) con calibrazioni Sport, Medio, Eco e costo/km dinamico.
- **Accordion 3 — Algoritmo & Filtri**:
  - Limite deviazione massima predefinito, soglie di scostamento prezzo, toggle esclusione autostrada.
- **Accordion 4 — Notifiche & Dati di Sistema**:
  - Gestione cache, impostazioni modalità offline, frequenza refresh UI.
  - *Nota*: le push notification sono post-MVP (vedi 4.1); nel MVP questa sezione non le abilita.
- **Controlli save sticky**: barra bottom floating con *Salva Preferenze* e *Ripristina Predefiniti*.

---

### 6. Design System

Tutti i token di design, le rendering rules, gli stati dei componenti e le regole di coerenza cross-screen sono definiti **esclusivamente in `DESIGN.md`** (single source of truth). Questo PRD non li ripete per evitare divergenze. In caso di conflitto stilistico, vince DESIGN.md.

---

### 7. Success Metrics & KPIs

1. **Risparmio utente erogato**: € totali risparmiati per utente al mese (target: >€25/mese per utenti attivi).
2. **Compliance deviazione percorso**: >85% degli utenti che scelgono soste consigliate con deviazione <2 km.
3. **Time to Decision**: meno di 8 secondi dall'inserimento della destinazione alla selezione della stazione ottimale.
4. **Affidabilità freschezza dati**: i prezzi ingeriti corrispondono all'ultimo CSV MIMIT pubblicato (update daily 08:00) con 100% di accuratezza di parsing; la UI mostra sempre il timestamp di ingestione.