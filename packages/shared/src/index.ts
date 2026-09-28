/**
 * Tipi condivisi tra apps/api e apps/web, e usati dalla pipeline di ingestione
 * in packages/core. Solo definizioni di tipo: nessuna logica qui.
 */

/** Tipo carburante normalizzato (vedi docs/PLAN.md — Milestone 0, normalizzazione carburanti). */
export type FuelType = "benzina" | "diesel" | "gpl" | "metano" | "hvo" | "other" | "unknown";

/** Tipi carburante mostrati nella UI e usati nel calcolo del Net Savings Index (Milestone 1+). */
export const MVP_VISIBLE_FUEL_TYPES: readonly FuelType[] = ["benzina", "diesel", "gpl", "metano"];

export type TipoImpianto = "stradale" | "autostradale";

/** Stazione di servizio, normalizzata da anagrafica_impianti_attivi.csv (MIMIT). */
export interface Station {
  id: number;
  gestore: string;
  bandiera: string;
  tipoImpianto: TipoImpianto;
  nomeImpianto: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  lat: number;
  lon: number;
}

/** Prezzo carburante, normalizzato da prezzo_alle_8.csv (MIMIT). */
export interface FuelPrice {
  stationId: number;
  fuelType: FuelType;
  /** Valore originale non normalizzato del campo descCarburante, sempre conservato. */
  rawDescCarburante: string;
  isSelf: boolean;
  price: number;
  /** ISO 8601, derivato dal campo dtComu (GG/MM/AAAA HH:MM:SS). */
  communicatedAt: string;
}

export interface HealthStatus {
  status: "ok" | "degraded";
  database: "ok" | "error";
  timestamp: string;
}
