import { createRouteProjector, type Coordinate, type NationalPrice } from "@routefuel/core";
import type { CorridorPriceRow, CorridorQuery, StationRepository } from "../../src/search/StationRepository";

/** Estrae le coordinate da un WKT `LINESTRING(lon lat, ...)` generato da routeToWkt. */
function parseWkt(wkt: string): Coordinate[] {
  const inner = wkt.slice(wkt.indexOf("(") + 1, wkt.lastIndexOf(")"));
  return inner.split(",").map((pair) => {
    const [lon, lat] = pair.trim().split(/\s+/).map(Number);
    return [lon!, lat!] as Coordinate;
  });
}

/**
 * Repository fittizio: filtra per distanza dal tracciato come farebbe PostGIS
 * (ST_DWithin) e per fuel type; NON applica il filtro di freschezza (coperto
 * dal test di integrazione su PostgreSQL).
 */
export class InMemoryStationRepository implements StationRepository {
  lastQuery: CorridorQuery | null = null;

  constructor(
    private readonly rows: CorridorPriceRow[],
    private readonly national: NationalPrice | null = null,
    private readonly lastIngestionAt: Date | null = new Date("2026-09-28T07:00:00.000Z"),
  ) {}

  async findCorridorPrices(query: CorridorQuery): Promise<CorridorPriceRow[]> {
    this.lastQuery = query;
    const project = createRouteProjector(parseWkt(query.routeWkt));
    return this.rows.filter(
      (row) => project([row.lon, row.lat]).lateralDistanceKm * 1000 <= query.radiusMeters,
    );
  }

  async getNationalPrice(): Promise<NationalPrice | null> {
    return this.national;
  }

  async getLastIngestionAt(): Promise<Date | null> {
    return this.lastIngestionAt;
  }
}

let nextId = 1000;

/** Riga di prezzo con valori di default sensati per i test. */
export function row(overrides: Partial<CorridorPriceRow> & Pick<CorridorPriceRow, "lon" | "lat" | "price">): CorridorPriceRow {
  const id = overrides.stationId ?? nextId++;
  return {
    stationId: id,
    nomeImpianto: `Stazione ${id}`,
    bandiera: "Test",
    gestore: "Gestore Test",
    indirizzo: "Via Test 1",
    comune: "Comune",
    provincia: "XX",
    tipoImpianto: "stradale",
    isSelf: true,
    communicatedAt: "2026-09-27T10:00:00.000Z",
    ...overrides,
  };
}
