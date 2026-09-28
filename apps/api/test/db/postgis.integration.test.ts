import { routeToWkt } from "@routefuel/core";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "../../src/db/types";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import { PostgisStationRepository } from "../../src/search/PostgisStationRepository";
import { SearchService } from "../../src/search/SearchService";
import { SearchSessionStore } from "../../src/search/SearchSessionStore";
import { DbUsageCounter } from "../../src/usage/UsageCounter";

/**
 * Test di integrazione: richiedono `docker compose up -d`, `pnpm db:migrate` e `pnpm ingest`.
 * Si lanciano con `pnpm test:db` (RUN_DB_TESTS=1 impostato da vitest.db.config.ts).
 *
 * I dati di prova sono sintetici e collocati in mare aperto (Golfo del Leone), così non
 * interferiscono con le stazioni reali ingerite e restano deterministici.
 */
const enabled = process.env.RUN_DB_TESTS === "1";

describe.skipIf(!enabled)("integrazione PostgreSQL + PostGIS", () => {
  const TEST_STATION_ID = 999_999_001;
  let db: Kysely<Database>;
  let repository: PostgisStationRepository;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL non impostata (vedi apps/api/.env)");
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString }) }) });
    repository = new PostgisStationRepository(db);

    await db.deleteFrom("stations").where("id", "=", TEST_STATION_ID).execute();
    await db
      .insertInto("stations")
      .values({
        id: TEST_STATION_ID,
        gestore: "TEST",
        bandiera: "Test Bandiera",
        tipo_impianto: "stradale",
        nome_impianto: "Stazione di prova",
        indirizzo: "Mare aperto",
        comune: "Nessuno",
        provincia: "XX",
        lat: 42.0,
        lon: 3.0,
      })
      .execute();

    const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000);
    await db
      .insertInto("fuel_prices")
      .values([
        { station_id: TEST_STATION_ID, fuel_type: "benzina", raw_desc_carburante: "Benzina", is_self: true, price: 1.5, communicated_at: hoursAgo(1) },
        { station_id: TEST_STATION_ID, fuel_type: "benzina", raw_desc_carburante: "Benzina", is_self: false, price: 1.7, communicated_at: hoursAgo(1) },
        { station_id: TEST_STATION_ID, fuel_type: "diesel", raw_desc_carburante: "Gasolio", is_self: true, price: 1.6, communicated_at: hoursAgo(100) }, // stantio
      ])
      .execute();
  });

  afterAll(async () => {
    await db.deleteFrom("stations").where("id", "=", TEST_STATION_ID).execute(); // i prezzi cadono a cascata
    await db.deleteFrom("api_usage").where("service", "like", "test-%").execute();
    await db.destroy();
  });

  // Tracciato est-ovest a lat 42.0: la stazione di prova ci sta sopra (distanza ~0).
  const lineOnStation = routeToWkt([
    [2.9, 42.0],
    [3.1, 42.0],
  ]);
  // Tracciato a lat 42.05: la stazione è a ~5.56 km.
  const lineFiveKmAway = routeToWkt([
    [2.9, 42.05],
    [3.1, 42.05],
  ]);

  describe("findCorridorPrices — corridoio ST_DWithin", () => {
    it("trova la stazione sul tracciato con entrambe le modalità Self/Servito", async () => {
      const rows = await repository.findCorridorPrices({ routeWkt: lineOnStation, radiusMeters: 1000, fuelType: "benzina", maxAgeHours: 72 });
      const mine = rows.filter((r) => r.stationId === TEST_STATION_ID);

      expect(mine).toHaveLength(2);
      expect(mine.find((r) => r.isSelf)).toMatchObject({ price: 1.5, nomeImpianto: "Stazione di prova", bandiera: "Test Bandiera", tipoImpianto: "stradale", lat: 42, lon: 3 });
      expect(mine.find((r) => !r.isSelf)?.price).toBe(1.7);
      expect(new Date(mine[0]!.communicatedAt).getTime()).toBeGreaterThan(Date.now() - 2 * 3_600_000);
    });

    it("rispetta il raggio: a ~5.56 km compare con raggio 6 km ma non con 5 km", async () => {
      const inside = await repository.findCorridorPrices({ routeWkt: lineFiveKmAway, radiusMeters: 6000, fuelType: "benzina", maxAgeHours: 72 });
      const outside = await repository.findCorridorPrices({ routeWkt: lineFiveKmAway, radiusMeters: 5000, fuelType: "benzina", maxAgeHours: 72 });
      expect(inside.some((r) => r.stationId === TEST_STATION_ID)).toBe(true);
      expect(outside.some((r) => r.stationId === TEST_STATION_ID)).toBe(false);
    });

    it("FRESCHEZZA — esclude i prezzi più vecchi della soglia (100 h fa non passa a 72 h, passa a 200 h)", async () => {
      const query = { routeWkt: lineOnStation, radiusMeters: 1000, fuelType: "diesel" as const };
      const strict = await repository.findCorridorPrices({ ...query, maxAgeHours: 72 });
      const lenient = await repository.findCorridorPrices({ ...query, maxAgeHours: 200 });
      expect(strict.some((r) => r.stationId === TEST_STATION_ID)).toBe(false);
      expect(lenient.some((r) => r.stationId === TEST_STATION_ID)).toBe(true);
    });

    it("filtra per tipo di carburante", async () => {
      const gpl = await repository.findCorridorPrices({ routeWkt: lineOnStation, radiusMeters: 1000, fuelType: "gpl", maxAgeHours: 200 });
      expect(gpl.some((r) => r.stationId === TEST_STATION_ID)).toBe(false);
    });

    it("gestisce tracciati con centinaia di vertici", async () => {
      const long = routeToWkt(Array.from({ length: 800 }, (_, i) => [2.5 + i * 0.001, 42.0 + Math.sin(i / 20) * 0.001] as [number, number]));
      const rows = await repository.findCorridorPrices({ routeWkt: long, radiusMeters: 2000, fuelType: "benzina", maxAgeHours: 72 });
      expect(rows.some((r) => r.stationId === TEST_STATION_ID)).toBe(true);
    });
  });

  describe("getNationalPrice — ultimo livello della cascata P_avg", () => {
    it("restituisce una mediana plausibile su un campione ampio (richiede dati ingeriti)", async () => {
      const national = await repository.getNationalPrice({ fuelType: "benzina", onlySelf: true, maxAgeHours: 24 * 365 });
      expect(national).not.toBeNull();
      expect(national!.sampleSize).toBeGreaterThan(1000);
      expect(national!.median).toBeGreaterThan(0.5);
      expect(national!.median).toBeLessThan(4);
    });

    it("'solo Self' non può avere più campioni della regola 'Self, altrimenti Servito'", async () => {
      const selfOnly = await repository.getNationalPrice({ fuelType: "benzina", onlySelf: true, maxAgeHours: 24 * 365 });
      const mixed = await repository.getNationalPrice({ fuelType: "benzina", onlySelf: false, maxAgeHours: 24 * 365 });
      expect(mixed!.sampleSize).toBeGreaterThanOrEqual(selfOnly!.sampleSize);
    });

    it("una soglia di freschezza minuscola può lasciare il campione vuoto → null o campione ridotto", async () => {
      const all = await repository.getNationalPrice({ fuelType: "metano", onlySelf: true, maxAgeHours: 24 * 365 });
      const fresh = await repository.getNationalPrice({ fuelType: "metano", onlySelf: true, maxAgeHours: 1 });
      expect(fresh === null || fresh.sampleSize <= (all?.sampleSize ?? 0)).toBe(true);
    });
  });

  describe("getLastIngestionAt", () => {
    it("restituisce la data dell'ultima ingestione riuscita (richiede almeno un'ingestione)", async () => {
      const last = await repository.getLastIngestionAt();
      expect(last).toBeInstanceOf(Date);
      expect(last!.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe("DbUsageCounter — contatore persistente del kill switch", () => {
    const service = `test-${Date.now()}`;

    it("incrementa in modo atomico e persiste il totale", async () => {
      const counter = new DbUsageCounter(db);
      expect(await counter.get(service, "2026-09")).toBe(0);
      expect(await counter.increment(service, "2026-09")).toBe(1);
      expect(await counter.increment(service, "2026-09")).toBe(2);
      expect(await counter.increment(service, "2026-09", 5)).toBe(7);
      expect(await counter.get(service, "2026-09")).toBe(7);
    });

    it("periodi diversi hanno contatori indipendenti", async () => {
      const counter = new DbUsageCounter(db);
      await counter.increment(service, "2026-10");
      expect(await counter.get(service, "2026-10")).toBe(1);
      expect(await counter.get(service, "2026-09")).toBe(7);
    });

    it("incrementi concorrenti non perdono aggiornamenti", async () => {
      const counter = new DbUsageCounter(db);
      const concurrent = `${service}-concurrent`;
      await Promise.all(Array.from({ length: 20 }, () => counter.increment(concurrent, "2026-09")));
      expect(await counter.get(concurrent, "2026-09")).toBe(20);
    });
  });

  describe("SearchService con il repository PostGIS reale", () => {
    it("ricerca completa Milano Centrale → Bologna Centrale con routing mock e dati ingeriti", async () => {
      const service = new SearchService({
        routing: new MockRoutingProvider(),
        repository,
        budget: { status: async () => "ok" },
        sessions: new SearchSessionStore(),
      });

      const response = await service.search({
        origin: { lon: 9.204, lat: 45.4864 },
        destination: { lon: 11.3426, lat: 44.5058 },
        fuelType: "benzina",
        liters: 45,
        maxDetourKm: 5,
        consumptionKmPerLiter: 15,
        valueOfTimePerMinute: 0.15,
        onlySelf: true,
        maxPriceAgeHours: 24 * 365,
      });

      expect(response.candidatesEvaluated).toBeGreaterThan(20);
      expect(response.results.length).toBeGreaterThan(0);
      expect(["on_route", "corridor", "national"]).toContain(response.referencePrice.level);
      expect(response.pricesUpdatedAt).not.toBeNull();
      for (const result of response.results) {
        expect(result.detourKm).toBeLessThanOrEqual(5);
        expect(result.lateralDistanceKm).toBeLessThanOrEqual(5);
      }
      await service.waitForRefinement(response.searchId);
    });
  });
});
