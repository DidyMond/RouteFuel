import type { StationResult } from "@routefuel/shared";
import { describe, expect, it } from "vitest";
import { createRouteProjector, sortResults, type Coordinate } from "../src";

/**
 * Le stazioni sono posizionate con coordinate reali lungo un tracciato e la loro posizione (`alongRouteKm`) e
 * distanza laterale vengono calcolate dallo stesso proiettore usato dalla ricerca: si verifica quindi che l'ordine
 * «Sul percorso» segua davvero la posizione geografica, non valori inventati a mano.
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
}

function stationsAlong(route: Coordinate[], spots: Spot[]): StationResult[] {
  const project = createRouteProjector(route);
  return spots.map((spot) => {
    const { lateralDistanceKm, alongRouteKm } = project([spot.lon, spot.lat]);
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
      alongRouteKm,
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

describe("sortResults — «Sul percorso» = ordine di percorrenza", () => {
  // A ~11 km dalla partenza (3 km di lato), C ~28 km (1.6 km di lato), B ~44 km (praticamente sulla strada), D ~78 km.
  const spots: Spot[] = [
    { id: 1, lat: 45.1, lon: 9.038, netSavings: 4 }, // A: presto, ma lontana dalla strada
    { id: 2, lat: 45.4, lon: 9.001, netSavings: 20 }, // B: a metà, quasi sul tracciato, la più conveniente
    { id: 3, lat: 45.25, lon: 8.98, netSavings: 9 }, // C
    { id: 4, lat: 45.7, lon: 9.006, netSavings: 1 }, // D: in fondo
  ];

  it("la stazione incontrata per prima partendo da A viene mostrata prima", () => {
    const results = stationsAlong(LINE, spots);
    expect(ids(sortResults(results, "on_route"))).toEqual([1, 3, 2, 4]);
  });

  it("le posizioni lungo il tracciato sono quelle attese (verifica dei dati di prova)", () => {
    const [a, b, c, d] = stationsAlong(LINE, spots);
    expect(a!.alongRouteKm).toBeCloseTo(11.1, 0);
    expect(c!.alongRouteKm).toBeCloseTo(27.8, 0);
    expect(b!.alongRouteKm).toBeCloseTo(44.5, 0);
    expect(d!.alongRouteKm).toBeCloseTo(77.8, 0);
  });

  it("NON coincide con l'ordine per distanza dal tracciato né per risparmio né per deviazione", () => {
    const results = stationsAlong(LINE, spots);
    const travel = ids(sortResults(results, "on_route"));
    expect(ids([...results].sort((x, y) => x.lateralDistanceKm - y.lateralDistanceKm))).not.toEqual(travel);
    expect(ids(sortResults(results, "savings"))).toEqual([2, 3, 1, 4]);
    expect(ids(sortResults(results, "detour"))).toEqual([2, 4, 3, 1]);
    expect(travel).toEqual([1, 3, 2, 4]);
  });

  it("l'ordine non dipende da quello di arrivo dei risultati", () => {
    const results = stationsAlong(LINE, spots);
    expect(ids(sortResults([...results].reverse(), "on_route"))).toEqual([1, 3, 2, 4]);
    expect(ids(sortResults([results[2]!, results[0]!, results[3]!, results[1]!], "on_route"))).toEqual([1, 3, 2, 4]);
  });

  it("percorrendo lo stesso tratto in senso opposto (da B ad A) l'ordine si inverte", () => {
    const reversed = stationsAlong([...LINE].reverse(), spots);
    expect(ids(sortResults(reversed, "on_route"))).toEqual([4, 2, 3, 1]);
  });

  it("con tre sole stazioni sul tracciato, in fila, mantiene la sequenza geografica", () => {
    const three = stationsAlong(LINE, [
      { id: 30, lat: 45.9, lon: 9.0 },
      { id: 10, lat: 45.1, lon: 9.0 },
      { id: 20, lat: 45.5, lon: 9.0 },
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
      { id: 1, lat: 45.2, lon: 9.0 }, // gamba nord, ~22 km
      { id: 2, lat: 45.5, lon: 9.06 }, // tratto est, ~57 km
      { id: 3, lat: 45.08, lon: 9.12 }, // gamba sud: vicinissima ad A in linea d'aria ma ~100 km di percorso
    ]);
    // In linea d'aria la 3 sarebbe la più vicina ad A dopo la 1, ma si incontra per ultima.
    expect(ids(sortResults(results, "on_route"))).toEqual([1, 2, 3]);
    expect(results[2]!.alongRouteKm).toBeGreaterThan(results[1]!.alongRouteKm);
  });

  it("a pari posizione lungo il percorso prima la più vicina alla strada, poi la più conveniente", () => {
    // Pari posizione forzata: geometricamente due stazioni "affacciate" differiscono di qualche cm lungo il tracciato.
    const base = stationsAlong(LINE, [
      { id: 1, lat: 45.5, lon: 9.02, netSavings: 50 },
      { id: 2, lat: 45.5, lon: 9.005, netSavings: 1 },
      { id: 3, lat: 45.5, lon: 9.005, netSavings: 9 },
    ]);
    const results = base.map((r) => ({ ...r, alongRouteKm: 55.5, lateralDistanceKm: r.station.id === 1 ? 1.6 : 0.4 }));
    expect(ids(sortResults(results, "on_route"))).toEqual([3, 2, 1]);
  });

  it("non modifica la lista in ingresso", () => {
    const results = stationsAlong(LINE, spots);
    const before = ids(results);
    sortResults(results, "on_route");
    expect(ids(results)).toEqual(before);
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
