import { describe, expect, it } from "vitest";
import type { FuelPrice } from "@routefuel/shared";
import { dedupeToLowestPricePerStationFuelMode } from "../src/fuel/dedupePrices";

function price(overrides: Partial<FuelPrice>): FuelPrice {
  return {
    stationId: 1,
    fuelType: "diesel",
    rawDescCarburante: "Gasolio",
    isSelf: false,
    price: 1.75,
    communicatedAt: "2026-09-25T10:00:00.000Z",
    ...overrides,
  };
}

describe("dedupeToLowestPricePerStationFuelMode", () => {
  it("tiene il prezzo più basso tra varianti diverse che normalizzano sullo stesso tipo carburante", () => {
    const prices = [
      price({ rawDescCarburante: "Gasolio", price: 1.829 }),
      price({ rawDescCarburante: "Gasolio Premium", fuelType: "diesel", price: 1.949 }),
    ];

    const result = dedupeToLowestPricePerStationFuelMode(prices);

    expect(result).toHaveLength(1);
    expect(result[0]?.price).toBe(1.829);
    expect(result[0]?.rawDescCarburante).toBe("Gasolio");
  });

  it("a parità di prezzo tiene la comunicazione più recente", () => {
    const prices = [
      price({ price: 1.75, communicatedAt: "2026-09-24T10:00:00.000Z", rawDescCarburante: "Gasolio (vecchio)" }),
      price({ price: 1.75, communicatedAt: "2026-09-25T10:00:00.000Z", rawDescCarburante: "Gasolio (nuovo)" }),
    ];

    const result = dedupeToLowestPricePerStationFuelMode(prices);

    expect(result).toHaveLength(1);
    expect(result[0]?.rawDescCarburante).toBe("Gasolio (nuovo)");
  });

  it("non mischia mai stazioni, carburanti o modalità (self/servito) diverse", () => {
    const prices = [
      price({ stationId: 1, fuelType: "diesel", isSelf: false, price: 1.8 }),
      price({ stationId: 1, fuelType: "diesel", isSelf: true, price: 1.6 }),
      price({ stationId: 1, fuelType: "benzina", isSelf: false, price: 2.0 }),
      price({ stationId: 2, fuelType: "diesel", isSelf: false, price: 1.7 }),
    ];

    const result = dedupeToLowestPricePerStationFuelMode(prices);

    expect(result).toHaveLength(4);
  });
});
