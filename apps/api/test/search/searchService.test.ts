import type { SearchRequest } from "@routefuel/shared";
import { describe, expect, it } from "vitest";
import { AppError, BudgetExhaustedError } from "../../src/errors";
import type { BudgetGate, BudgetStatus } from "../../src/providers/routing/DirectionsBudget";
import { MockRoutingProvider } from "../../src/providers/routing/MockRoutingProvider";
import type { RouteResult, RoutingProvider } from "../../src/providers/routing/RoutingProvider";
import { RESULT_LIMIT, REFINE_TOP_N, SearchService } from "../../src/search/SearchService";
import { type SearchSession, SearchSessionStore } from "../../src/search/SearchSessionStore";
import { InMemoryStationRepository, row } from "../helpers/inMemoryStationRepository";

/**
 * Scenario: tratta est-ovest a latitudine 45.0 da lon 9.0 a lon 10.0 (~78 km).
 * 1° di latitudine ≈ 111.19 km, quindi 0.001° ≈ 0.11 km di distanza laterale.
 */
const ORIGIN = { lon: 9.0, lat: 45.0 };
const DESTINATION = { lon: 10.0, lat: 45.0 };

const request: SearchRequest = {
  origin: ORIGIN,
  destination: DESTINATION,
  fuelType: "benzina",
  liters: 45,
  maxDetourKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: true,
  maxPriceAgeHours: 72,
};

// Tre stazioni sul percorso (≤ 0.5 km) → livello 1 di P_avg: mediana = 1.82
const onRoute = () => [
  row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
  row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
  row({ stationId: 3, lon: 9.6, lat: 45.003, price: 1.84 }),
];

function buildService(
  rows = onRoute(),
  options: { national?: { median: number; sampleSize: number } | null; routing?: RoutingProvider; budget?: BudgetStatus } = {},
) {
  const routing = options.routing ?? new MockRoutingProvider();
  const budgetStatus: BudgetGate = { status: async () => options.budget ?? "ok" };
  const repository = new InMemoryStationRepository(rows, options.national ?? null);
  const service = new SearchService({ routing, repository, budget: budgetStatus, sessions: new SearchSessionStore() });
  return { service, repository, routing };
}

/** Routing con comportamento scriptato per le richieste "via stazione" (3 waypoint). */
class ScriptedRouting implements RoutingProvider {
  readonly inner = new MockRoutingProvider();
  viaCalls = 0;
  constructor(private readonly onVia: (viaStation: { lon: number; lat: number }) => Promise<RouteResult | null>) {}

  async getRoute(waypoints: Parameters<RoutingProvider["getRoute"]>[0]) {
    if (waypoints.length === 3) {
      this.viaCalls += 1;
      return this.onVia(waypoints[1]!);
    }
    return this.inner.getRoute(waypoints);
  }
}

describe("SearchService.search — ranking e prezzo di riferimento", () => {
  it("usa la mediana delle stazioni sul percorso come prezzo di riferimento (livello 1)", async () => {
    const { service } = buildService();
    const response = await service.search(request);

    expect(response.referencePrice).toEqual({ value: 1.82, level: "on_route", sampleSize: 3 });
    expect(response.costPerKm).toBeCloseTo(1.82 / 15, 4);
  });

  it("ordina per risparmio netto decrescente e calcola S_net con la formula del PRD", async () => {
    const { service } = buildService([
      ...onRoute(),
      row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 }), // ~1.33 km laterale, molto più economica
    ]);
    const { results } = await service.search(request);

    expect(results[0]!.station.id).toBe(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.netSavings).toBeGreaterThanOrEqual(results[i]!.netSavings);
    }

    const best = results[0]!;
    // (1.82 − 1.70) × 45 L = 5.40 € lordi, meno costo carburante e tempo della deviazione stimata
    expect(best.grossSavings).toBeCloseTo(5.4, 2);
    expect(best.detourCost).toBeGreaterThan(0);
    expect(best.netSavings).toBeCloseTo(best.grossSavings - best.detourCost, 1);
    expect(best.detourSource).toBe("proxy");
  });

  it("una stazione più cara del riferimento ha risparmio netto negativo ma resta in elenco", async () => {
    const { service } = buildService([...onRoute(), row({ stationId: 6, lon: 9.5, lat: 45.001, price: 2.1 })]);
    const { results } = await service.search(request);
    const expensive = results.find((r) => r.station.id === 6);
    expect(expensive?.netSavings).toBeLessThan(0);
  });

  it("esclude le stazioni la cui deviazione stimata supera la deviazione massima", async () => {
    // 0.02° ≈ 2.22 km laterali → deviazione proxy ≈ 5.56 km
    const rows = [...onRoute(), row({ stationId: 4, lon: 9.5, lat: 45.02, price: 1.6 })];

    const at5 = await buildService(rows).service.search({ ...request, maxDetourKm: 5 });
    expect(at5.results.map((r) => r.station.id)).not.toContain(4);

    const at6 = await buildService(rows).service.search({ ...request, maxDetourKm: 6 });
    expect(at6.results.map((r) => r.station.id)).toContain(4);
  });

  it("il raggio del corridoio segue lo slider della deviazione (con minimo 1 km e massimo 15 km)", async () => {
    const { service, repository } = buildService();
    await service.search({ ...request, maxDetourKm: 5 });
    expect(repository.lastQuery?.radiusMeters).toBe(5000);

    await service.search({ ...request, maxDetourKm: 1 });
    expect(repository.lastQuery?.radiusMeters).toBe(1000);

    await service.search({ ...request, maxDetourKm: 10 });
    expect(repository.lastQuery?.radiusMeters).toBe(10000);
  });

  it("passa al repository il tracciato in WKT, il carburante e la soglia di freschezza", async () => {
    const { service, repository } = buildService();
    await service.search({ ...request, fuelType: "diesel", maxPriceAgeHours: 24 });
    expect(repository.lastQuery?.routeWkt).toMatch(/^LINESTRING\(9\.000000 45\.000000, .*10\.000000 45\.000000\)$/);
    expect(repository.lastQuery?.fuelType).toBe("diesel");
    expect(repository.lastQuery?.maxAgeHours).toBe(24);
  });

  it("restituisce metadati: percorso, candidati valutati e data dell'ultima ingestione", async () => {
    const { service } = buildService();
    const response = await service.search(request);
    expect(response.route.distanceKm).toBeGreaterThan(75);
    expect(response.route.durationMinutes).toBeGreaterThan(0);
    expect(response.candidatesEvaluated).toBe(3);
    expect(response.pricesUpdatedAt).toBe("2026-09-28T07:00:00.000Z");
    expect(response.searchId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("pricesUpdatedAt è null se non esiste alcuna ingestione riuscita", async () => {
    const repository = new InMemoryStationRepository(onRoute(), null, null);
    const service = new SearchService({
      routing: new MockRoutingProvider(),
      repository,
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
    });
    expect((await service.search(request)).pricesUpdatedAt).toBeNull();
  });

  it("arrotonda i valori in uscita (prezzi a 3 decimali, importi a 2)", async () => {
    const { service } = buildService([...onRoute(), row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 })]);
    const { results } = await service.search(request);
    for (const result of results) {
      expect(Math.round(result.netSavings * 100) / 100).toBe(result.netSavings);
      expect(Math.round(result.price * 1000) / 1000).toBe(result.price);
    }
  });

  it("limita la risposta alle migliori RESULT_LIMIT stazioni ma dichiara quante ne ha valutate", async () => {
    const many = Array.from({ length: RESULT_LIMIT + 30 }, (_, i) =>
      row({ stationId: 100 + i, lon: 9.1 + i * 0.01, lat: 45.001, price: 1.7 + i * 0.001 }),
    );
    const { service } = buildService(many);
    const response = await service.search({ ...request, maxDetourKm: 5 });
    expect(response.candidatesEvaluated).toBe(RESULT_LIMIT + 30);
    expect(response.results).toHaveLength(RESULT_LIMIT);
  });
});

describe("SearchService.search — cascata P_avg", () => {
  it("con meno di 3 stazioni sul percorso ricade sul corridoio (livello 2)", async () => {
    const rows = [
      row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }), // on-route
      row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }), // on-route
      row({ stationId: 3, lon: 9.6, lat: 45.01, price: 1.9 }), // ~1.1 km: solo corridoio
    ];
    const { referencePrice } = await buildService(rows).service.search(request);
    expect(referencePrice.level).toBe("corridor");
    expect(referencePrice.sampleSize).toBe(3);
    expect(referencePrice.value).toBe(1.82);
  });

  it("con meno di 3 stazioni nel corridoio ricade sulla mediana nazionale (livello 3)", async () => {
    const rows = [row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 })];
    const { referencePrice } = await buildService(rows, { national: { median: 1.95, sampleSize: 30000 } }).service.search(request);
    expect(referencePrice).toEqual({ value: 1.95, level: "national", sampleSize: 30000 });
  });

  it("carburante raro senza stazioni nel corridoio: usa comunque la mediana nazionale", async () => {
    const { referencePrice, results } = await buildService([], { national: { median: 1.79, sampleSize: 1578 } }).service.search({
      ...request,
      fuelType: "metano",
    });
    expect(referencePrice.level).toBe("national");
    expect(results).toEqual([]);
  });

  it("senza dati sufficienti a nessun livello → errore NO_PRICE_DATA", async () => {
    const promise = buildService([], { national: null }).service.search(request);
    await expect(promise).rejects.toBeInstanceOf(AppError);
    await expect(promise).rejects.toMatchObject({ code: "NO_PRICE_DATA", httpStatus: 422 });
  });

  it("una stazione lontana e molto cara non altera il riferimento on-route", async () => {
    const withOutlier = [...onRoute(), row({ stationId: 9, lon: 9.5, lat: 45.03, price: 2.6 })];
    const a = await buildService(onRoute()).service.search({ ...request, maxDetourKm: 5 });
    const b = await buildService(withOutlier).service.search({ ...request, maxDetourKm: 5 });
    expect(b.referencePrice.value).toBe(a.referencePrice.value);
  });
});

describe("SearchService.search — Self / Servito", () => {
  const withServitoOnly = () => [
    ...onRoute(),
    row({ stationId: 7, lon: 9.7, lat: 45.001, price: 1.75, isSelf: false }), // solo Servito
  ];

  it("'Solo Self' attivo (default): la stazione solo-Servito è esclusa", async () => {
    const { results, candidatesEvaluated } = await buildService(withServitoOnly()).service.search({ ...request, onlySelf: true });
    expect(results.map((r) => r.station.id)).not.toContain(7);
    expect(candidatesEvaluated).toBe(3);
  });

  it("'Solo Self' disattivato: la stazione solo-Servito compare con il flag servitoOnly", async () => {
    const { results } = await buildService(withServitoOnly()).service.search({ ...request, onlySelf: false });
    const servito = results.find((r) => r.station.id === 7);
    expect(servito).toBeDefined();
    expect(servito?.servitoOnly).toBe(true);
    expect(servito?.isSelf).toBe(false);
    expect(servito?.price).toBe(1.75);
  });

  it("una stazione con entrambi i prezzi usa sempre il Self, mai una media", async () => {
    const rows = [
      row({ stationId: 8, lon: 9.5, lat: 45.001, price: 1.7, isSelf: true }),
      row({ stationId: 8, lon: 9.5, lat: 45.001, price: 1.9, isSelf: false }),
      ...onRoute(),
    ];
    const { results } = await buildService(rows).service.search({ ...request, onlySelf: false });
    const both = results.find((r) => r.station.id === 8);
    expect(both).toMatchObject({ price: 1.7, isSelf: true, servitoOnly: false });
  });

  it("il prezzo di riferimento usa lo stesso criterio di scelta prezzo per stazione", async () => {
    // Tre stazioni: due Self (1.80, 1.82) e una solo-Servito (2.00)
    const rows = [
      row({ stationId: 1, lon: 9.2, lat: 45.001, price: 1.8 }),
      row({ stationId: 2, lon: 9.4, lat: 45.002, price: 1.82 }),
      row({ stationId: 3, lon: 9.6, lat: 45.003, price: 2.0, isSelf: false }),
    ];
    const selfOnly = await buildService(rows, { national: { median: 1.9, sampleSize: 1000 } }).service.search({ ...request, onlySelf: true });
    expect(selfOnly.referencePrice.level).toBe("national"); // solo 2 campioni Self → cascata
    const mixed = await buildService(rows).service.search({ ...request, onlySelf: false });
    expect(mixed.referencePrice).toMatchObject({ level: "on_route", value: 1.82, sampleSize: 3 });
  });
});

describe("SearchService.search — errori", () => {
  it("nessun percorso tra origine e destinazione → NO_ROUTE", async () => {
    const routing: RoutingProvider = { getRoute: async () => null };
    const promise = buildService(onRoute(), { routing }).service.search(request);
    await expect(promise).rejects.toMatchObject({ code: "NO_ROUTE", httpStatus: 422 });
  });

  it("un errore del provider di routing si propaga invariato", async () => {
    const routing: RoutingProvider = { getRoute: async () => { throw new BudgetExhaustedError(); } };
    await expect(buildService(onRoute(), { routing }).service.search(request)).rejects.toBeInstanceOf(BudgetExhaustedError);
  });
});

describe("SearchService — ricalcolo in background con routing reale (top-N)", () => {
  const stations = () => [
    ...onRoute(),
    row({ stationId: 5, lon: 9.5, lat: 45.012, price: 1.7 }),
  ];

  it("la risposta immediata è provvisoria: stato pending e deviazioni 'proxy'", async () => {
    const { service } = buildService(stations());
    const response = await service.search(request);
    expect(response.refinement).toEqual({ status: "pending" });
    expect(response.results.every((r) => r.detourSource === "proxy")).toBe(true);
    await service.waitForRefinement(response.searchId);
  });

  it("a ricalcolo concluso le prime stazioni hanno deviazione verificata dal routing", async () => {
    const { service, routing } = buildService(stations());
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);

    const refined = service.getRefinement(searchId)!;
    expect(refined.refinement).toEqual({ status: "done" });
    expect(refined.results.filter((r) => r.detourSource === "routing")).toHaveLength(4); // tutte e 4 (< REFINE_TOP_N)
    // 1 chiamata per il percorso A→B + 1 per ciascuna stazione verificata (A→stazione→B)
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 2)).toHaveLength(1);
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(4);
  });

  it("verifica al massimo REFINE_TOP_N stazioni, anche se i risultati sono di più", async () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      row({ stationId: 200 + i, lon: 9.1 + i * 0.05, lat: 45.001, price: 1.6 + i * 0.01 }),
    );
    const { service, routing } = buildService(many);
    const { searchId } = await service.search(request);
    await service.waitForRefinement(searchId);

    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(REFINE_TOP_N);
    const refined = service.getRefinement(searchId)!;
    expect(refined.results.filter((r) => r.detourSource === "routing")).toHaveLength(REFINE_TOP_N);
  });

  it("verifica le stazioni migliori secondo il ranking proxy e passa i waypoint A → stazione → B", async () => {
    const { service, routing } = buildService(stations());
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const viaCalls = (routing as MockRoutingProvider).calls.filter((c) => c.length === 3);
    for (const call of viaCalls) {
      expect(call[0]).toEqual(ORIGIN);
      expect(call[2]).toEqual(DESTINATION);
    }
    expect(viaCalls.map((c) => c[1]!.lon)).toContain(9.5); // la stazione n. 5, in testa al ranking
  });

  it("la deviazione verificata ricalcola risparmio netto e può riordinare la classifica", async () => {
    // Il routing reale dice che la stazione economica (id 5) richiede 4.4 km di deviazione.
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? { distanceKm: direct!.distanceKm + 4.4, durationMinutes: direct!.durationMinutes + 7, geometry: [] }
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.2, geometry: [] },
    );
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    const proxyNet = first.results.find((r) => r.station.id === 5)!.netSavings;
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!.results.find((r) => r.station.id === 5)!;
    expect(refined.detourSource).toBe("routing");
    expect(refined.detourKm).toBeCloseTo(4.4, 2);
    expect(refined.detourMinutes).toBeCloseTo(7, 1);
    expect(refined.netSavings).not.toBe(proxyNet);
    // (1.82 − 1.70) × 45 = 5.40 − 4.4 km × 0.1213 − 7 min × 0.15 = 5.40 − 0.534 − 1.05
    expect(refined.netSavings).toBeCloseTo(5.4 - 4.4 * (1.82 / 15) - 7 * 0.15, 1);
  });

  it("una stazione la cui deviazione REALE supera il massimo viene esclusa dall'elenco", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const routing = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? { distanceKm: direct!.distanceKm + 7.5, durationMinutes: direct!.durationMinutes + 11, geometry: [] } // > 5 km
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.1, geometry: [] },
    );
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    expect(first.results.map((r) => r.station.id)).toContain(5); // il proxy la considerava valida

    await service.waitForRefinement(first.searchId);
    const refined = service.getRefinement(first.searchId)!;
    expect(refined.results.map((r) => r.station.id)).not.toContain(5);
    expect(refined.results).toHaveLength(3);
  });

  it("se il routing di una stazione restituisce null, quella stazione mantiene la stima proxy", async () => {
    const direct = await new MockRoutingProvider().getRoute([ORIGIN, DESTINATION]);
    const scripted = new ScriptedRouting(async (station) =>
      station.lon === 9.5
        ? null
        : { distanceKm: direct!.distanceKm + 0.1, durationMinutes: direct!.durationMinutes + 0.1, geometry: [] },
    );
    const { service } = buildService(stations(), { routing: scripted });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement.status).toBe("done");
    expect(refined.results.find((r) => r.station.id === 5)?.detourSource).toBe("proxy");
    expect(refined.results.find((r) => r.station.id === 1)?.detourSource).toBe("routing");
  });

  it("se il routing fallisce per tutte le stazioni: stato failed, risultati proxy invariati", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new Error("timeout");
    });
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement).toEqual({ status: "failed", reason: "routing_error" });
    expect(refined.results).toEqual(first.results);
    expect(refined.results.every((r) => r.detourSource === "proxy")).toBe(true);
  });

  it("KILL SWITCH — oltre la soglia soft nessuna chiamata di verifica: solo proxy, stato skipped", async () => {
    const { service, routing } = buildService(stations(), { budget: "soft_limit" });
    const response = await service.search(request);

    expect(response.refinement).toEqual({ status: "skipped", reason: "budget_soft_limit" });
    await service.waitForRefinement(response.searchId);
    expect((routing as MockRoutingProvider).calls).toHaveLength(1); // solo A→B
    expect(response.results.every((r) => r.detourSource === "proxy")).toBe(true);
    expect(service.getRefinement(response.searchId)!.refinement.status).toBe("skipped");
  });

  it("KILL SWITCH — quota esaurita durante il ricalcolo: skipped/budget_hard_limit, risultati proxy conservati", async () => {
    const routing = new ScriptedRouting(async () => {
      throw new BudgetExhaustedError();
    });
    const { service } = buildService(stations(), { routing });
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);

    const refined = service.getRefinement(first.searchId)!;
    expect(refined.refinement).toEqual({ status: "skipped", reason: "budget_hard_limit" });
    expect(refined.results).toEqual(first.results);
  });

  it("nessun risultato → nessun ricalcolo (stato done)", async () => {
    const { service } = buildService([], { national: { median: 1.8, sampleSize: 5000 } });
    const response = await service.search(request);
    expect(response.results).toEqual([]);
    expect(response.refinement).toEqual({ status: "done" });
  });

  it("getRefinement con id sconosciuto → null", () => {
    expect(buildService().service.getRefinement("00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("non riverifica più volte la stessa combinazione: una ricerca = una sola serie di chiamate", async () => {
    const { service, routing } = buildService(stations());
    const first = await service.search(request);
    await service.waitForRefinement(first.searchId);
    service.getRefinement(first.searchId);
    service.getRefinement(first.searchId); // le letture ripetute non innescano nuove chiamate
    expect((routing as MockRoutingProvider).calls.filter((c) => c.length === 3)).toHaveLength(4);
  });
});

describe("SearchSessionStore", () => {
  const session = (id: string, createdAt: number): SearchSession => ({
    id,
    request,
    route: { distanceKm: 1, durationMinutes: 1 },
    referencePrice: { value: 1, level: "on_route", sampleSize: 3 },
    costPerKm: 0.1,
    results: [],
    refinement: { status: "done" },
    createdAt,
  });

  it("le sessioni scadono dopo il TTL", () => {
    let now = 0;
    const store = new SearchSessionStore({ ttlMs: 1000, now: () => now });
    store.set(session("a", 0));
    now = 999;
    expect(store.get("a")).toBeDefined();
    now = 1001;
    expect(store.get("a")).toBeUndefined();
  });

  it("scarta le sessioni più vecchie oltre il numero massimo", () => {
    const store = new SearchSessionStore({ maxEntries: 2, now: () => 0 });
    store.set(session("a", 0));
    store.set(session("b", 0));
    store.set(session("c", 0));
    expect(store.size).toBe(2);
    expect(store.get("a")).toBeUndefined();
    expect(store.get("c")).toBeDefined();
  });
});

describe("SearchService — prezzi in tempo reale", () => {
  const liveInfo = { status: "live", tilesTotal: 6, tilesLive: 6, oldestLiveAgeMinutes: 4 } as const;

  it("senza fonte live la risposta dichiara 'disabled' e la ricerca funziona con i prezzi del file", async () => {
    const { service } = buildService();
    const response = await service.search(request);
    expect(response.livePrices).toEqual({ status: "disabled", tilesTotal: 0, tilesLive: 0, oldestLiveAgeMinutes: null });
    expect(response.results.length).toBeGreaterThan(0);
  });

  it("aggiorna i prezzi PRIMA di leggere il corridoio e passa tracciato e raggio corretti", async () => {
    const rows = onRoute();
    const repository = new InMemoryStationRepository(rows);
    const calls: Array<{ points: number; bufferKm: number }> = [];
    const service = new SearchService({
      routing: new MockRoutingProvider(),
      repository,
      budget: { status: async () => "ok" },
      sessions: new SearchSessionStore(),
      livePrices: {
        async ensureFresh(route, bufferKm) {
          calls.push({ points: route.length, bufferKm });
          // Simula il refresh: una stazione ribassa il prezzo. La ricerca deve vederlo.
          rows[0] = { ...rows[0]!, price: 1.5 };
          return liveInfo;
        },
      },
    });

    const response = await service.search({ ...request, maxDetourKm: 4 });

    expect(calls).toEqual([{ points: 2, bufferKm: 4 }]);
    expect(response.livePrices).toEqual(liveInfo);
    const cheapest = response.results.find((r) => r.station.id === rows[0]!.stationId);
    expect(cheapest?.price).toBe(1.5);
  });

  it("propaga lo stato 'partial'/'unavailable' senza far fallire la ricerca", async () => {
    for (const status of ["partial", "unavailable"] as const) {
      const service = new SearchService({
        routing: new MockRoutingProvider(),
        repository: new InMemoryStationRepository(onRoute()),
        budget: { status: async () => "ok" },
        sessions: new SearchSessionStore(),
        livePrices: { ensureFresh: async () => ({ status, tilesTotal: 6, tilesLive: status === "partial" ? 2 : 0, oldestLiveAgeMinutes: null }) },
      });
      const response = await service.search(request);
      expect(response.livePrices.status).toBe(status);
      expect(response.results.length).toBeGreaterThan(0);
    }
  });
});
