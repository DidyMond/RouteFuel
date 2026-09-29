import type { SearchRequest, SearchResponse, StationResult } from "@routefuel/shared";

let nextId = 100;

/** Risultato di ricerca con valori sensati; sovrascrivi solo ciò che serve al test. */
export function makeResult(
  overrides: Partial<Omit<StationResult, "station">> & { station?: Partial<StationResult["station"]> } = {},
): StationResult {
  const id = overrides.station?.id ?? nextId++;
  const { station, ...rest } = overrides;
  return {
    station: {
      id,
      nomeImpianto: `Stazione ${id}`,
      bandiera: "Agip Eni",
      gestore: "ENIMOOV S.P.A.",
      indirizzo: "Via Roma 1",
      comune: "Bregnano",
      provincia: "CO",
      tipoImpianto: "stradale",
      lat: 45.68,
      lon: 9.05,
      ...station,
    },
    price: 1.99,
    isSelf: true,
    servitoOnly: false,
    priceUpdatedAt: "2026-09-28T09:11:43.000Z",
    lateralDistanceKm: 1,
    alongRouteKm: 5,
    detourKm: 2,
    detourMinutes: 3,
    detourSource: "proxy",
    grossSavings: 8,
    detourCost: 1,
    netSavings: 7,
    ...rest,
  };
}

export const REQUEST: SearchRequest = {
  origin: { lon: 9.204, lat: 45.4864 },
  destination: { lon: 11.3426, lat: 44.5058 },
  fuelType: "benzina",
  liters: 45,
  maxDetourKm: 5,
  consumptionKmPerLiter: 15,
  valueOfTimePerMinute: 0.15,
  onlySelf: false,
  maxPriceAgeHours: 72,
};

/** Tre stazioni con ordinamenti diversi per risparmio, deviazione e distanza dal tracciato. */
export function makeResults(): StationResult[] {
  return [
    makeResult({
      station: { id: 1, nomeImpianto: "Alfa Autostrada", bandiera: "Agip Eni", tipoImpianto: "autostradale" },
      netSavings: 12,
      detourKm: 3,
      lateralDistanceKm: 0.2,
      alongRouteKm: 90,
      price: 1.89,
    }),
    makeResult({
      station: { id: 2, nomeImpianto: "Beta Strada", bandiera: "Q8", tipoImpianto: "stradale" },
      netSavings: 5,
      detourKm: 0.4,
      lateralDistanceKm: 0.1,
      alongRouteKm: 20,
      price: 1.95,
    }),
    makeResult({
      station: { id: 3, nomeImpianto: "Gamma Servito", bandiera: "Pompe Bianche", tipoImpianto: "stradale" },
      netSavings: -2,
      detourKm: 1.5,
      lateralDistanceKm: 0.9,
      alongRouteKm: 50,
      price: 2.2,
      isSelf: false,
      servitoOnly: true,
      detourSource: "routing",
    }),
  ];
}

export function makeResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    searchId: "s1",
    route: {
      distanceKm: 216.6,
      durationMinutes: 153,
      geometry: [
        [9.204, 45.4864],
        [10.3, 45.0],
        [11.3426, 44.5058],
      ],
    },
    referencePrice: { value: 2.15, level: "on_route", sampleSize: 40 },
    costPerKm: 0.143,
    results: makeResults(),
    candidatesEvaluated: 549,
    pricesUpdatedAt: "2026-09-28T19:13:47.000Z",
    livePrices: { status: "live", tilesTotal: 37, tilesLive: 37, oldestLiveAgeMinutes: 4 },
    refinement: { status: "done" },
    ...overrides,
  };
}
