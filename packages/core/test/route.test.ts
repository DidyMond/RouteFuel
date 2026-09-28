import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import { describe, expect, it } from "vitest";
import {
  createRouteProjector,
  routeLengthKm,
  routeToWkt,
  simplifyRoute,
  type Coordinate,
} from "../src/geo/route";

// Tratto est-ovest a latitudine 45°: 1° di longitudine ≈ 78.6 km, 1° di latitudine ≈ 111.2 km.
const eastWest: Coordinate[] = [
  [9.0, 45.0],
  [10.0, 45.0],
];

describe("routeLengthKm", () => {
  it("misura la lunghezza geodetica in km", () => {
    expect(routeLengthKm([[0, 0], [1, 0]])).toBeCloseTo(111.19, 1); // 1° all'equatore
    expect(routeLengthKm(eastWest)).toBeCloseTo(78.6, 0);
  });

  it("somma i tratti di una polilinea", () => {
    const two = routeLengthKm([[9, 45], [9.5, 45], [10, 45]]);
    expect(two).toBeCloseTo(routeLengthKm(eastWest), 0);
  });

  it("richiede almeno 2 coordinate", () => {
    expect(() => routeLengthKm([[9, 45]])).toThrow(RangeError);
  });
});

describe("routeToWkt", () => {
  it("produce un LINESTRING con ordine lon lat", () => {
    expect(routeToWkt([[9.2, 45.4864], [11.3426, 44.5058]])).toBe(
      "LINESTRING(9.200000 45.486400, 11.342600 44.505800)",
    );
  });

  it("richiede almeno 2 coordinate", () => {
    expect(() => routeToWkt([[9, 45]])).toThrow(RangeError);
  });
});

describe("simplifyRoute", () => {
  it("elimina i vertici collineari mantenendo origine e destinazione", () => {
    const dense: Coordinate[] = Array.from({ length: 101 }, (_, i) => [9 + i * 0.01, 45] as Coordinate);
    const simplified = simplifyRoute(dense);
    expect(simplified.length).toBe(2);
    expect(simplified[0]).toEqual(dense[0]);
    expect(simplified[simplified.length - 1]).toEqual(dense[dense.length - 1]);
  });

  it("mantiene i vertici che fanno realmente curvare il tracciato", () => {
    const bend: Coordinate[] = [
      [9.0, 45.0],
      [9.5, 45.0],
      [9.5, 45.5], // curva a 90°, ben oltre la tolleranza
      [10.0, 45.5],
    ];
    expect(simplifyRoute(bend)).toEqual(bend);
  });

  it("non altera sensibilmente la lunghezza della rotta", () => {
    const wobbly: Coordinate[] = Array.from({ length: 201 }, (_, i) => [
      9 + i * 0.005,
      45 + Math.sin(i / 10) * 0.0001, // oscillazione di ~10 m, sotto la tolleranza
    ]);
    expect(routeLengthKm(simplifyRoute(wobbly))).toBeCloseTo(routeLengthKm(wobbly), 0);
  });

  it("lascia intatta una rotta di 2 punti", () => {
    expect(simplifyRoute(eastWest)).toEqual(eastWest);
  });

  it("richiede almeno 2 coordinate", () => {
    expect(() => simplifyRoute([[9, 45]])).toThrow(RangeError);
  });
});

describe("createRouteProjector", () => {
  // Un meridiano è un cerchio massimo: le distanze attese sono esatte (turf misura su archi geodetici,
  // quindi un tratto est-ovest "sale" leggermente rispetto al parallelo e non è adatto a asserzioni precise).
  const meridian: Coordinate[] = [
    [9.0, 45.0],
    [9.0, 46.0],
  ];
  const project = createRouteProjector(meridian);
  const totalKm = routeLengthKm(meridian); // ~111.19 km

  it("un punto sul tracciato ha distanza laterale ~0", () => {
    expect(project([9.0, 45.3]).lateralDistanceKm).toBeLessThan(0.01);
  });

  it("calcola la distanza laterale one-way (0.05° di longitudine a 45.5° ≈ 3.90 km)", () => {
    expect(project([9.05, 45.5]).lateralDistanceKm).toBeCloseTo(3.9, 1);
  });

  it("è simmetrico rispetto al lato del tracciato", () => {
    const east = project([9.05, 45.5]).lateralDistanceKm;
    const west = project([8.95, 45.5]).lateralDistanceKm;
    expect(east).toBeCloseTo(west, 3);
  });

  it("calcola la posizione lungo il tracciato in km dall'origine", () => {
    expect(project([9.0, 45.0]).alongRouteKm).toBeCloseTo(0, 1);
    expect(project([9.05, 45.5]).alongRouteKm).toBeCloseTo(totalKm / 2, 0);
    expect(project([9.0, 46.0]).alongRouteKm).toBeCloseTo(totalKm, 1);
  });

  it("un punto oltre l'arrivo si proietta sull'ultimo vertice", () => {
    const beyond = project([9.0, 46.1]);
    expect(beyond.alongRouteKm).toBeCloseTo(totalKm, 1);
    expect(beyond.lateralDistanceKm).toBeCloseTo(11.12, 1); // 0.1° di latitudine
  });

  it("su una rotta a più tratti sceglie il segmento più vicino", () => {
    const l: Coordinate[] = [
      [9.0, 45.0],
      [10.0, 45.0],
      [10.0, 46.0],
    ];
    const nearSecondLeg = createRouteProjector(l)([10.05, 45.5]);
    expect(nearSecondLeg.lateralDistanceKm).toBeCloseTo(3.9, 1);
    expect(nearSecondLeg.alongRouteKm).toBeGreaterThan(routeLengthKm(l.slice(0, 2)));
  });

  it("gli errori di geometria in ingresso sono espliciti", () => {
    expect(() => createRouteProjector([[9, 45]])).toThrow(RangeError);
  });

  it("dà gli stessi risultati di turf 'forza bruta' su una rotta tortuosa (tolleranza 1 m)", () => {
    // PRNG deterministico (mulberry32): il test non dipende dal caso.
    let seed = 42;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const winding: Coordinate[] = Array.from({ length: 400 }, (_, i) => [
      9 + i * 0.004 + Math.sin(i / 15) * 0.05,
      45 + Math.sin(i / 23) * 0.15 + i * 0.001,
    ]);
    const bruteForce = lineString(winding);
    const project = createRouteProjector(winding);

    // Punti realistici: entro ~3 km dal tracciato, come le stazioni di un corridoio. A distanze molto
    // maggiori due tratti possono essere equidistanti (differenza di decimetri) e la posizione lungo
    // la rotta diventa ambigua: entrambe le risposte sono corrette, quindi non le si confronta.
    for (let n = 0; n < 300; n++) {
      const vertex = winding[Math.floor(random() * winding.length)]!;
      const target: Coordinate = [vertex[0] + (random() - 0.5) * 0.06, vertex[1] + (random() - 0.5) * 0.06];
      const expected = nearestPointOnLine(bruteForce, point(target), { units: "kilometers" });
      const actual = project(target);

      expect(actual.lateralDistanceKm).toBeCloseTo(expected.properties.dist ?? 0, 3);
      expect(actual.alongRouteKm).toBeCloseTo(expected.properties.location ?? 0, 3);
    }
  });
});
