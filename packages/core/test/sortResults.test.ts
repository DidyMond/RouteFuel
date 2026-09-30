import type { StationResult } from "@routefuel/shared";
import { describe, expect, it } from "vitest";
import { createRouteProjector, sortResults, type Coordinate } from "../src";

/**
 * Le stazioni sono posizionate con coordinate reali lungo un tracciato e la loro posizione (`alongRouteKm`) e
 * distanza laterale vengono calcolate dallo stesso proiettore usato dalla ricerca: si verifica quindi che l'ordine
 * «Sul percorso» segua davvero la geografia, non valori inventati a mano.
 *
 * Tracciato lineare: meridiano lon 9.0 da lat 45.0 a 46.0 (~111 km, verso nord). 1° di latitudine ≈ 111.19 km;
 * a lat 45 lo scostamento di 0.01° di longitudine ≈ 0.79 km.
 */
const LINE: Coordinate[] = [
  [9.0, 45.0],
  [9.0, 46.0],
];

interface Spot {
  id: number;
  lon: number;
  lat: number;
  netSavings?: number;
  detourKm?: number;
  /** Forza la distanza laterale (per i pareggi: geometricamente due stazioni non hanno mai la stessa distanza esatta). */
  lateralKm?: number;
}

function stationsAlong(route: Coordinate[], spots: Spot[]): StationResult[] {
  const project = createRouteProjector(route);
  return spots.map((spot) => {
    const projected = project([spot.lon, spot.lat]);
    const lateralDistanceKm = spot.lateralKm ?? projected.lateralDistanceKm;
    return {
      station: {
        id: spot.id,
        nomeImpianto: `Stazione ${spot.id}`,
        bandiera: "Test",
        gestore: "Test",
        indirizzo: "",
        comune: "",
        provincia: "",
        tipoImpianto: "stradale",
        lat: spot.lat,
        lon: spot.lon,
      },
      price: 2,
      isSelf: true,
      servitoOnly: false,
      priceUpdatedAt: "2026-09-28T10:00:00.000Z",
      lateralDistanceKm,
      alongRouteKm: projected.alongRouteKm,
      detourKm: spot.detourKm ?? 2 * lateralDistanceKm,
      detourMinutes: 1,
      detourSource: "proxy",
      grossSavings: 0,
      detourCost: 0,
      netSavings: spot.netSavings ?? 0,
    };
  });
}

const ids = (results: StationResult[]) => results.map((r) => r.station.id);

describe("sortResults — «Sul percorso»: prima le stazioni sulla strada", () => {
  // Posizione lungo il tracciato e distanza dalla strada sono volutamente in ordine diverso.
  const spots: Spot[] = [
    { id: 1, lat: 45.1, lon: 9.038, netSavings: 4 }, // ~11 km dalla partenza, ~3 km di lato
    { id: 2, lat: 45.4, lon: 9.001, netSavings: 20 }, // ~44 km, praticamente sul tracciato (~0.08 km)
    { id: 3, lat: 45.25, lon: 8.98, netSavings: 9 }, // ~28 km, ~1.6 km di lato
    { id: 4, lat: 45.7, lon: 9.006, netSavings: 1 }, // ~78 km, ~0.47 km di lato
  ];

  it("ordina per distanza laterale dal tracciato crescente", () => {
    const results = stationsAlong(LINE, spots);
    expect(ids(sortResults(results, "on_route"))).toEqual([2, 4, 3, 1]);
  });

  it("i dati di prova hanno posizioni e distanze laterali attese (verifica delle fixture)", () => {
    const [a, b, c, d] = stationsAlong(LINE, spots);
    expect(a!.alongRouteKm).toBeCloseTo(11.1, 0);
    expect(c!.alongRouteKm).toBeCloseTo(27.8, 0);
    expect(b!.alongRouteKm).toBeCloseTo(44.5, 0);
    expect(d!.alongRouteKm).toBeCloseTo(77.8, 0);
    expect(b!.lateralDistanceKm).toBeLessThan(0.15);
    expect(d!.lateralDistanceKm).toBeGreaterThan(0.4);
    expect(c!.lateralDistanceKm).toBeGreaterThan(1.4);
    expect(a!.lateralDistanceKm).toBeGreaterThan(2.5);
  });

  it("NON è l'ordine di percorrenza né quello per risparmio", () => {
    const results = stationsAlong(LINE, spots);
    const onRoute = ids(sortResults(results, "on_route"));
    expect(onRoute).not.toEqual(ids([...results].sort((x, y) => x.alongRouteKm - y.alongRouteKm))); // [1,3,2,4]
    expect(onRoute).not.toEqual(ids(sortResults(results, "savings"))); // [2,3,1,4]
  });

  it("con una deviazione verificata diversa dalla stima proxy, «Sul percorso» segue comunque la distanza laterale", () => {
    const results = stationsAlong(
      LINE,
      spots.map((s) => ({ ...s, detourKm: 10 - s.id })), // deviazioni "verificate" in ordine opposto alla distanza laterale
    );
    expect(ids(sortResults(results, "on_route"))).toEqual([2, 4, 3, 1]);
    expect(ids(sortResults(results, "detour"))).toEqual([4, 3, 2, 1]);
  });

  it("l'ordine non dipende da quello di arrivo dei risultati", () => {
    const results = stationsAlong(LINE, spots);
    expect(ids(sortResults([...results].reverse(), "on_route"))).toEqual([2, 4, 3, 1]);
    expect(ids(sortResults([results[2]!, results[0]!, results[3]!, results[1]!], "on_route"))).toEqual([2, 4, 3, 1]);
  });

  it("non modifica la lista in ingresso", () => {
    const results = stationsAlong(LINE, spots);
    const before = ids(results);
    sortResults(results, "on_route");
    expect(ids(results)).toEqual(before);
  });
});

describe("sortResults — «Sul percorso»: a pari distanza laterale, ordine di incontro", () => {
  // Quattro stazioni tutte a 0.3 km dalla strada, in posizioni diverse lungo il tracciato lineare.
  const aligned: Spot[] = [
    { id: 30, lat: 45.9, lon: 9.004, lateralKm: 0.3, netSavings: 50 },
    { id: 10, lat: 45.1, lon: 9.004, lateralKm: 0.3, netSavings: 1 },
    { id: 40, lat: 45.95, lon: 9.004, lateralKm: 0.3, netSavings: 7 },
    { id: 20, lat: 45.5, lon: 9.004, lateralKm: 0.3, netSavings: 9 },
  ];

  it("la stazione incontrata per prima partendo da A viene prima", () => {
    expect(ids(sortResults(stationsAlong(LINE, aligned), "on_route"))).toEqual([10, 20, 30, 40]);
  });

  it("percorrendo lo stesso tratto in senso opposto (da B ad A) l'ordine si inverte", () => {
    expect(ids(sortResults(stationsAlong([...LINE].reverse(), aligned), "on_route"))).toEqual([40, 30, 20, 10]);
  });

  it("tre stazioni in fila sul tracciato mantengono la sequenza geografica", () => {
    const three = stationsAlong(LINE, [
      { id: 30, lat: 45.9, lon: 9.0, lateralKm: 0 },
      { id: 10, lat: 45.1, lon: 9.0, lateralKm: 0 },
      { id: 20, lat: 45.5, lon: 9.0, lateralKm: 0 },
    ]);
    expect(ids(sortResults(three, "on_route"))).toEqual([10, 20, 30]);
  });

  it("tracciato a «U»: conta la posizione lungo il percorso, non la distanza in linea d'aria da A", () => {
    // Nord per ~56 km, poi est ~9 km, poi di nuovo sud fino quasi al punto di partenza.
    const U: Coordinate[] = [
      [9.0, 45.0],
      [9.0, 45.5],
      [9.12, 45.5],
      [9.12, 45.05],
    ];
    const results = stationsAlong(U, [
      { id: 3, lat: 45.08, lon: 9.12, lateralKm: 0.2 }, // gamba sud: vicinissima ad A in linea d'aria ma ~100 km di percorso
      { id: 1, lat: 45.2, lon: 9.0, lateralKm: 0.2 }, // gamba nord, ~22 km
      { id: 2, lat: 45.5, lon: 9.06, lateralKm: 0.2 }, // tratto est, ~57 km
    ]);
    expect(ids(sortResults(results, "on_route"))).toEqual([1, 2, 3]);
    expect(results.find((r) => r.station.id === 3)!.alongRouteKm).toBeGreaterThan(
      results.find((r) => r.station.id === 2)!.alongRouteKm,
    );
  });

  it("tracciato a «U» percorso al contrario: l'ordine di incontro si inverte", () => {
    const U: Coordinate[] = [
      [9.12, 45.05],
      [9.12, 45.5],
      [9.0, 45.5],
      [9.0, 45.0],
    ];
    const results = stationsAlong(U, [
      { id: 3, lat: 45.08, lon: 9.12, lateralKm: 0.2 }, // ora è la prima
      { id: 1, lat: 45.2, lon: 9.0, lateralKm: 0.2 }, // ora è l'ultima
      { id: 2, lat: 45.5, lon: 9.06, lateralKm: 0.2 },
    ]);
    expect(ids(sortResults(results, "on_route"))).toEqual([3, 2, 1]);
  });

  it("la distanza laterale ha la precedenza sull'ordine di incontro", () => {
    // La 2 è più avanti lungo il percorso ma è quasi sulla strada: passa prima della 1, che è incontrata prima.
    const results = stationsAlong(LINE, [
      { id: 1, lat: 45.1, lon: 9.0, lateralKm: 0.6 },
      { id: 2, lat: 45.8, lon: 9.0, lateralKm: 0.1 },
    ]);
    expect(ids(sortResults(results, "on_route"))).toEqual([2, 1]);
  });

  it("a pari distanza laterale e pari posizione decide il risparmio netto", () => {
    const base = stationsAlong(LINE, [
      { id: 1, lat: 45.5, lon: 9.004, lateralKm: 0.3, netSavings: 1 },
      { id: 2, lat: 45.5, lon: 9.004, lateralKm: 0.3, netSavings: 9 },
      { id: 3, lat: 45.5, lon: 9.004, lateralKm: 0.3, netSavings: 5 },
    ]);
    expect(ids(sortResults(base, "on_route"))).toEqual([2, 3, 1]);
  });
});

describe("sortResults — gli altri ordinamenti", () => {
  const results = stationsAlong(LINE, [
    { id: 1, lat: 45.1, lon: 9.0, netSavings: 5, detourKm: 3 },
    { id: 2, lat: 45.3, lon: 9.0, netSavings: 12, detourKm: 3 },
    { id: 3, lat: 45.5, lon: 9.0, netSavings: -1, detourKm: 0.4 },
  ]);

  it("«Più conveniente»: risparmio netto decrescente", () => {
    expect(ids(sortResults(results, "savings"))).toEqual([2, 1, 3]);
  });

  it("«Minor deviazione»: km extra crescenti, a parità il risparmio maggiore", () => {
    expect(ids(sortResults(results, "detour"))).toEqual([3, 2, 1]);
  });
});
