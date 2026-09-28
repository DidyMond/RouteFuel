import { describe, expect, it } from "vitest";
import { isPlausiblePrice } from "../src/validation/price";

describe("isPlausiblePrice", () => {
  it("accetta prezzi realistici osservati nel dataset (es. 2.669, 0.849, 1.794)", () => {
    expect(isPlausiblePrice(2.669)).toBe(true);
    expect(isPlausiblePrice(0.849)).toBe(true);
    expect(isPlausiblePrice(1.794)).toBe(true);
  });

  it("rifiuta un prezzo a zero", () => {
    expect(isPlausiblePrice(0)).toBe(false);
  });

  it("rifiuta un evidente errore di battitura (es. 26.69 invece di 2.669)", () => {
    expect(isPlausiblePrice(26.69)).toBe(false);
  });

  it("rifiuta valori negativi o non finiti", () => {
    expect(isPlausiblePrice(-1)).toBe(false);
    expect(isPlausiblePrice(Number.NaN)).toBe(false);
  });
});
