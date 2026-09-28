# Open Questions — checklist finale pre-Milestone 0

Dopo due round di chiarimenti, quasi tutte le ambiguità hanno ora una proposta concreta e documentata in `PLAN.md` e `STACK_DECISION.md`. Restano solo: (A) un rischio non completamente verificabile da me, e (B) un dato che solo tu puoi fornire. Il resto è una checklist di conferma riassuntiva — se non specifichi diversamente, procedo con quanto proposto.

---

### A. Rischio aperto — compliance Termini di Servizio Mapbox
Se in futuro salveremo preset "Casa"/"Lavoro" persistenti, la mitigazione proposta (salvare solo l'indirizzo testuale, non le coordinate, in `localStorage`) evita ragionevolmente la categoria "permanent geocoding" di Mapbox, ma non ho letto i ToS legali riga per riga — solo pricing/documentazione tecnica pubblica. Se questo prodotto avrà rilevanza commerciale, raccomando una verifica legale formale prima del lancio pubblico. **Per l'MVP e lo sviluppo locale non è bloccante**: procedo con la mitigazione proposta salvo tua indicazione contraria.

### B. Repository GitHub remoto — nessuna proposta possibile
Serve: nome utente/organizzazione GitHub di destinazione, nome del repository, se il repo remoto esiste già vuoto o va creato da zero (es. via `gh repo create`). **Non blocca** lo scaffold locale e la Milestone 0 — serve solo per il push finale.

---

### Checklist di conferma (procedo con questi valori salvo tue modifiche)

| # | Decisione | Valore proposto |
|---|---|---|
| 1 | Stack | Vite+React+TS+Tailwind (PWA) / Fastify+TS / PostgreSQL+PostGIS+Kysely / Mapbox (Directions+GL JS+Geocoding v6) / Vercel+Railway |
| 2 | Mapping carburanti | 4 tipi MVP (Benzina/Diesel/GPL/Metano) + bucket `hvo`/`other`/`unknown` esclusi da UI ma salvati con `raw_desc_carburante` |
| 3 | `P_avg` | Cascata: mediana on-route (≤0.5km) → mediana corridoio → mediana nazionale, soglia minima 3 campioni per livello, per combinazione fuel+modalità |
| 4 | `P_avg` override | Automatico di default; override manuale solo in Impostazioni (Accordion "Algoritmo & Filtri"), sostituisce interamente il calcolo finché non si torna ad Automatico |
| 5 | `C_km` | Solo costo carburante, `P_avg / consumo`, mai `P_station` |
| 6 | Semantica deviazione | `max_detour_km` = round-trip (A→stazione→B vs A→B); buffer PostGIS one-way generoso separato; soglia "on-route" fissa a 0.5km one-way |
| 7 | Deviazione reale | Ibrida: proxy per tutte, routing reale Mapbox (`mapbox/driving`) per top-5 in background + on-demand in Screen 3 |
| 8 | Self/Servito | Default Self; "Solo Self" OFF include anche "solo Servito" con badge esplicito, mai media dei due prezzi |
| 9 | Token Mapbox | 3 token separati (client URL-ristretto, server non ristretto + rate limit su `/search`, dev locale) |
| 10 | Kill switch | Soglia 80.000 chiamate Directions/mese → modalità degradata solo-proxy automatica |
| 11 | Dati MIMIT assenti | Rimozione totale (no placeholder) di uscita autostradale specifica, "Aperto ora", servizi, telefono, numero pompe, logo brand ufficiale (sostituito da badge testuale/lookup `Bandiera`) |
| 12 | Filtro Autostrada/Extraurbane | Confermato realizzabile: `Tipo Impianto` ha davvero 2 valori reali (`Stradale` ~23.450, `Autostradale` ~540) |
| 13 | Deep-link navigatore | Rilevamento automatico OS (iOS→Apple Maps, Android→Google Maps) + menu esplicito sempre disponibile (incluso Waze) |
| 14 | Default | V_time=€0.15/min, freschezza=72h (esclusione, non solo badge), deviazione max=5km, litri=45L, consumo=15km/L, modalità=Self |
| 15 | Persistenza client | Tragitti frequenti/preset/profilo veicolo solo in `localStorage`, nessuna persistenza server-side nell'MVP |

Se confermi (anche con un semplice "procedi" o "ok"), inizio la Milestone 0.
