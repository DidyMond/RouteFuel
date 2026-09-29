import type { NationalPrice } from "@routefuel/core";
import type { SearchFuelType } from "@routefuel/shared";
import { sql, type Kysely } from "kysely";
import type { Database } from "../db/types";
import type { CorridorPriceRow, CorridorQuery, StationRepository } from "./StationRepository";

interface RawCorridorRow {
  station_id: number;
  nome_impianto: string;
  bandiera: string;
  gestore: string;
  indirizzo: string;
  comune: string;
  provincia: string;
  tipo_impianto: "stradale" | "autostradale";
  lat: number;
  lon: number;
  is_self: boolean;
  price: number;
  communicated_at: Date;
}

export class PostgisStationRepository implements StationRepository {
  constructor(private readonly db: Kysely<Database>) {}

  /**
   * Corridoio = tutte le stazioni entro `radiusMeters` dal tracciato.
   * `ST_DWithin` su geography è l'equivalente esatto di "dentro il buffer" di
   * `ST_Buffer(tracciato, raggio)` e sfrutta l'indice GiST su stations.geom,
   * senza materializzare il poligono del buffer (costoso su tracciati lunghi).
   * `use_spheroid = false`: calcolo sferico, più veloce e ampiamente
   * sufficiente alla scala di km del corridoio.
   */
  async findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]> {
    const result = await sql<RawCorridorRow>`
      SELECT
        s.id AS station_id,
        s.nome_impianto, s.bandiera, s.gestore, s.indirizzo, s.comune, s.provincia,
        s.tipo_impianto, s.lat, s.lon,
        p.is_self, p.price, p.communicated_at
      FROM stations s
      JOIN fuel_prices p ON p.station_id = s.id
      WHERE p.fuel_type = ${query.fuelType}
        AND p.communicated_at >= now() - make_interval(hours => ${query.maxAgeHours}::int)
        AND ST_DWithin(s.geom, ST_GeogFromText(${query.routeWkt}), ${query.radiusMeters}::float8, false)
    `.execute(this.db);

    return result.rows.map((row) => ({
      stationId: row.station_id,
      nomeImpianto: row.nome_impianto,
      bandiera: row.bandiera,
      gestore: row.gestore,
      indirizzo: row.indirizzo,
      comune: row.comune,
      provincia: row.provincia,
      tipoImpianto: row.tipo_impianto,
      lat: row.lat,
      lon: row.lon,
      isSelf: row.is_self,
      price: row.price,
      communicatedAt: row.communicated_at.toISOString(),
    }));
  }

  /**
   * Mediana nazionale con la stessa regola di scelta prezzo della ricerca:
   * "solo Self" → i prezzi Self; altrimenti Self se presente, altrimenti Servito.
   */
  async getNationalPrice(query: {
    fuelType: SearchFuelType;
    onlySelf: boolean;
    maxAgeHours: number;
  }): Promise<NationalPrice | null> {
    const selfOnlyClause = query.onlySelf ? sql`AND is_self` : sql``;

    const result = await sql<{ median: number | null; sample_size: number }>`
      SELECT
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median,
        count(*)::int AS sample_size
      FROM (
        SELECT DISTINCT ON (station_id) price
        FROM fuel_prices
        WHERE fuel_type = ${query.fuelType}
          AND communicated_at >= now() - make_interval(hours => ${query.maxAgeHours}::int)
          ${selfOnlyClause}
        ORDER BY station_id, is_self DESC
      ) chosen
    `.execute(this.db);

    const row = result.rows[0];
    if (!row || row.median === null || row.sample_size === 0) {
      return null;
    }
    return { median: row.median, sampleSize: row.sample_size };
  }

  async getLastIngestionAt(): Promise<Date | null> {
    const row = await this.db
      .selectFrom("ingestion_runs")
      .select("finished_at")
      .where("status", "=", "success")
      .where("finished_at", "is not", null)
      .orderBy("finished_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.finished_at ?? null;
  }
}
