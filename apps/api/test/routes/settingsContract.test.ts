import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../../src/app";
import { FixtureGeocodingProvider } from "../../src/providers/geocoding/FixtureGeocodingProvider";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import { SearchService } from "../../src/search/SearchService";
import { SearchSessionStore } from "../../src/search/SearchSessionStore";
import { InMemoryStationRepository, row } from "../helpers/inMemoryStationRepository";

const body = {
  origin: { lon: 9.0, lat: 45.0 },
  destination: { lon: 10.0, lat: 45.0 },
  fuelType: "benzina",
};

const stations = () => [
  row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
  row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
  row({ stationId: 3, lon: 9.6, lat: 45.003, price: 1.84 }),
];

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp() {
  const routing = new MockRoutingProvider();
  const searchService = new SearchService({
    routing,
    repository: new InMemoryStationRepository(stations()),
    budget: { status: async () => "ok" },
    sessions: new SearchSessionStore(),
  });
  const app = await buildApp({
    logger: false,
    trustProxy: false,
    corsOrigin: "http://localhost:5173",
    searchService,
    geocoding: new FixtureGeocodingProvider(),
    searchRateLimitPerMinute: 100,
    geocodeRateLimitPerMinute: 100,
    checkDatabase: async () => true,
    runIngestion: async () => ({ ok: true }),
  });
  apps.push(app);
  return { app, routing, searchService };
}

describe("POST /search — contratto delle Impostazioni (M4)", () => {
  it("avoidMotorway: true viene accettato e arriva al routing del percorso diretto", async () => {
    const { app, routing, searchService } = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: { ...body, avoidMotorway: true } });
    expect(response.statusCode).toBe(200);
    expect(routing.callOptions[0]).toEqual({ avoidMotorway: true });
    await searchService.waitForRefinement(response.json().searchId);
    expect(routing.callOptions.every((o) => o.avoidMotorway === true)).toBe(true);
  });

  it("avoidMotorway assente vale false (default)", async () => {
    const { app, routing } = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: body });
    expect(response.statusCode).toBe(200);
    expect(routing.callOptions[0]).toEqual({ avoidMotorway: false });
  });

  it("avoidMotorway non booleano → 400", async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: { ...body, avoidMotorway: "sì" } });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("referencePriceOverride valido: la risposta usa il livello «manual» e quel valore", async () => {
    const { app } = await makeApp();
    const response = await app.inject({ method: "POST", url: "/search", payload: { ...body, referencePriceOverride: 2.3 } });
    expect(response.statusCode).toBe(200);
    expect(response.json().referencePrice).toEqual({ value: 2.3, level: "manual", sampleSize: 0 });
  });

  it("referencePriceOverride fuori range (0,5–4 €/L) → 400", async () => {
    const { app } = await makeApp();
    for (const value of [0.1, 0.49, 4.01, 20, -1, "2,3"]) {
      const response = await app.inject({ method: "POST", url: "/search", payload: { ...body, referencePriceOverride: value } });
      expect(response.statusCode, String(value)).toBe(400);
    }
  });

  it("valueOfTimePerMinute e maxPriceAgeHours delle Impostazioni (0,05–1,00 €/min; ore) sono accettati", async () => {
    const { app } = await makeApp();
    for (const extra of [{ valueOfTimePerMinute: 0.05 }, { valueOfTimePerMinute: 1 }, { maxPriceAgeHours: 24 }, { maxPriceAgeHours: 168 }]) {
      const response = await app.inject({ method: "POST", url: "/search", payload: { ...body, ...extra } });
      expect(response.statusCode, JSON.stringify(extra)).toBe(200);
    }
  });
});
