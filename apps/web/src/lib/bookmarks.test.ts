import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BOOKMARKS_KEY, isStationSaved, readSavedStations, resetBookmarkMemory, toggleSavedStation } from "./bookmarks";

const station = { id: 7, nomeImpianto: "Stazione 7", comune: "Lomazzo", lat: 45.7, lon: 9.02 };
const fixedNow = () => new Date("2026-10-01T10:00:00.000Z");

beforeEach(() => {
  localStorage.clear();
  resetBookmarkMemory();
});
afterEach(() => vi.restoreAllMocks());

describe("stazioni salvate", () => {
  it("salva, riconosce e rimuove una stazione", () => {
    expect(isStationSaved(7)).toBe(false);
    expect(toggleSavedStation(station, fixedNow)).toBe(true);
    expect(isStationSaved(7)).toBe(true);
    expect(readSavedStations()).toEqual([{ ...station, savedAt: "2026-10-01T10:00:00.000Z" }]);
    expect(toggleSavedStation(station, fixedNow)).toBe(false);
    expect(isStationSaved(7)).toBe(false);
    expect(JSON.parse(localStorage.getItem(BOOKMARKS_KEY)!)).toEqual([]);
  });

  it("tiene più stazioni e ne rimuove solo quella indicata", () => {
    toggleSavedStation(station, fixedNow);
    toggleSavedStation({ ...station, id: 8 }, fixedNow);
    toggleSavedStation(station, fixedNow);
    expect(readSavedStations().map((s) => s.id)).toEqual([8]);
  });

  it("scarta i dati corrotti o di forma sbagliata", () => {
    localStorage.setItem(BOOKMARKS_KEY, "non json");
    expect(readSavedStations()).toEqual([]);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify({ id: 1 }));
    expect(readSavedStations()).toEqual([]);
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([{ id: "x" }, { ...station, savedAt: "2026-10-01T10:00:00.000Z" }]));
    expect(readSavedStations().map((s) => s.id)).toEqual([7]);
  });

  it("senza storage utilizzabile funziona in memoria, senza lanciare", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    expect(toggleSavedStation(station, fixedNow)).toBe(true);
    expect(isStationSaved(7)).toBe(true);
    expect(toggleSavedStation(station, fixedNow)).toBe(false);
    expect(isStationSaved(7)).toBe(false);
  });
});
