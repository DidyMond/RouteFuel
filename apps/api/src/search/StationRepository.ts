import type { NationalPrice } from "@routefuel/core";
import type { SearchFuelType, StationPriceEntry, TipoImpianto } from "@routefuel/shared";

/** Una riga per (stazione, modalità Self/Servito) con il prezzo fresco per il carburante cercato. */
export interface CorridorPriceRow {
  stationId: number;
  nomeImpianto: string;
  bandiera: string;
  gestore: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  tipoImpianto: TipoImpianto;
  lat: number;
  lon: number;
  isSelf: boolean;
  price: number;
  /** ISO 8601. */
  communicatedAt: string;
}

export interface CorridorQuery {
  /** Tracciato (semplificato) in WKT, coordinate lon lat. */
  routeWkt: string;
  /** Raggio one-way del corridoio attorno al tracciato. */
  radiusMeters: number;
  fuelType: SearchFuelType;
  /** Prezzi comunicati da più di N ore vengono esclusi. */
  maxAgeHours: number;
}

/** Accesso ai dati delle stazioni: porta astratta, l'unica implementazione di produzione usa PostGIS. */
export interface StationRepository {
  findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]>;
  /** Mediana nazionale per la combinazione carburante/modalità (ultimo livello della cascata di P_avg). */
  getNationalPrice(query: { fuelType: SearchFuelType; onlySelf: boolean; maxAgeHours: number }): Promise<NationalPrice | null>;
  /**
   * Tutte le combinazioni carburante × modalità della stazione con prezzo fresco (solo i 4 carburanti dell'MVP:
   * benzina, diesel, GPL, metano), per il dettaglio stazione.
   */
  getStationPrices(stationId: number, maxAgeHours: number): Promise<StationPriceEntry[]>;
  /** Fine dell'ultima ingestione MIMIT riuscita, o null se non ne esiste alcuna. */
  getLastIngestionAt(): Promise<Date | null>;
}
