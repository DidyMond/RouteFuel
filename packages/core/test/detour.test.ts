import { describe, expect, it } from "vitest";
import {
  computeRoutedDetour,
  estimateProxyDetour,
  PROXY_CIRCUITY_FACTOR,
  PROXY_DETOUR_SPEED_KMH,
} from "../src/geo/detour";

describe("estimateProxyDetour", () => {
  it("una stazione esattamente sul tracciato ha deviazione zero", () => {
    expect(estimateProxyDetour(0)).toEqual({ km: 0, minutes: 0 });
  });

  it("è andata e ritorno (2×) corretta per la tortuosità stradale", () => {
    const { km } = estimateProxyDetour(2);
    expect(km).toBeCloseTo(2 * 2 * PROXY_CIRCUITY_FACTOR, 10); // 5 km
  });

  it("i minuti derivano dai km alla velocità media di deviazione", () => {
    const { km, minutes } = estimateProxyDetour(2);
    expect(minutes).toBeCloseTo((km / PROXY_DETOUR_SPEED_KMH) * 60, 10); // 7.5 min
    expect(minutes).toBeCloseTo(7.5, 10);
  });

  it("è monotona crescente nella distanza laterale", () => {
    expect(estimateProxyDetour(3).km).toBeGreaterThan(estimateProxyDetour(1).km);
    expect(estimateProxyDetour(3).minutes).toBeGreaterThan(estimateProxyDetour(1).minutes);
  });

  it("rifiuta distanze negative o non finite", () => {
    expect(() => estimateProxyDetour(-0.1)).toThrow(RangeError);
    expect(() => estimateProxyDetour(Number.NaN)).toThrow(RangeError);
    expect(() => estimateProxyDetour(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("computeRoutedDetour", () => {
  const direct = { distanceKm: 216.6, durationMinutes: 152.9 };

  it("è la differenza tra A→stazione→B e A→B (esempio reale Milano→Bologna via Lodi)", () => {
    const via = { distanceKm: 231.3, durationMinutes: 174.0 };
    const detour = computeRoutedDetour(direct, via);
    expect(detour.km).toBeCloseTo(14.7, 5);
    expect(detour.minutes).toBeCloseTo(21.1, 5);
  });

  it("non scende mai sotto zero (differenze di snapping tra le due richieste)", () => {
    const via = { distanceKm: 216.4, durationMinutes: 152.5 };
    expect(computeRoutedDetour(direct, via)).toEqual({ km: 0, minutes: 0 });
  });

  it("gestisce separatamente km e minuti", () => {
    const via = { distanceKm: 218.0, durationMinutes: 152.0 }; // più km, ma meno minuti
    const detour = computeRoutedDetour(direct, via);
    expect(detour.km).toBeCloseTo(1.4, 5);
    expect(detour.minutes).toBe(0);
  });
});
