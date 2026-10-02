import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  factorySettings,
  FACTORY_SETTINGS,
  loadSettings,
  parseDecimal,
  prefillManualReference,
  referenceOverrideFor,
  resetSettingsMemory,
  sanitizeSettings,
  samePreferences,
  saveSettings,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  type Settings,
} from "./settings";

beforeEach(() => {
  localStorage.clear();
  resetSettingsMemory();
});
afterEach(() => vi.restoreAllMocks());

const custom = (): Settings => ({
  vehicle: { bodyType: "suv", modelName: "Golf 1.5 eTSI", tankLiters: 50, defaultFuel: "diesel" },
  consumptionKmPerLiter: 17.5,
  valueOfTimePerMinute: 0.3,
  referenceMode: "manual",
  manualReference: { benzina: 1.9, diesel: 1.8 },
  lastAutomaticReference: { benzina: 1.85 },
  avoidMotorway: true,
  maxPriceAgeHours: 48,
});

describe("valori di fabbrica", () => {
  it("coincidono con i default confermati: 45 L, 15 km/L, 0,15 €/min, 72 h, Benzina, Automatico, autostrada ammessa", () => {
    expect(FACTORY_SETTINGS.vehicle).toEqual({ bodyType: "berlina", modelName: "", tankLiters: 45, defaultFuel: "benzina" });
    expect(FACTORY_SETTINGS.consumptionKmPerLiter).toBe(15);
    expect(FACTORY_SETTINGS.valueOfTimePerMinute).toBe(0.15);
    expect(FACTORY_SETTINGS.referenceMode).toBe("auto");
    expect(FACTORY_SETTINGS.manualReference).toEqual({});
    expect(FACTORY_SETTINGS.avoidMotorway).toBe(false);
    expect(FACTORY_SETTINGS.maxPriceAgeHours).toBe(72);
  });

  it("senza nulla di salvato si parte dai valori di fabbrica", () => {
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
  });
});

describe("persistenza (routefuel.settings.v1)", () => {
  it("usa la chiave versionata e scrive versione + impostazioni", () => {
    expect(SETTINGS_KEY).toBe("routefuel.settings.v1");
    saveSettings(custom());
    const raw = JSON.parse(localStorage.getItem("routefuel.settings.v1")!);
    expect(raw.version).toBe(SETTINGS_VERSION);
    expect(raw.settings.vehicle.tankLiters).toBe(50);
  });

  it("salvataggio e rilettura coincidono", () => {
    saveSettings(custom());
    expect(loadSettings()).toEqual(custom());
  });

  it("NON salva indirizzi né coordinate (vincolo ToS Mapbox)", () => {
    saveSettings(custom());
    const raw = localStorage.getItem(SETTINGS_KEY)!;
    expect(raw).not.toMatch(/lat|lon|coordinat|indirizzo|address|origin|destination/i);
  });

  it("una versione sconosciuta (futura o danneggiata) non viene interpretata: valori di fabbrica", () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: 99, settings: custom() }));
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ settings: custom() }));
    expect(loadSettings()).toEqual(FACTORY_SETTINGS);
  });

  it("JSON corrotto o di forma sbagliata → valori di fabbrica, senza lanciare", () => {
    for (const raw of ["non json", "null", "[]", "42", '"x"']) {
      localStorage.setItem(SETTINGS_KEY, raw);
      expect(loadSettings()).toEqual(FACTORY_SETTINGS);
    }
  });

  it("senza storage utilizzabile funziona in memoria", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("bloccato");
    });
    saveSettings(custom());
    expect(loadSettings()).toEqual(custom());
  });
});

describe("sanitizeSettings — ogni campo non valido torna al valore di fabbrica", () => {
  it("campi validi passano, fuori intervallo o di tipo sbagliato no", () => {
    const dirty = {
      vehicle: { bodyType: "astronave", modelName: 12, tankLiters: 999, defaultFuel: "idrogeno" },
      consumptionKmPerLiter: 100,
      valueOfTimePerMinute: 0.01,
      referenceMode: "boh",
      manualReference: { benzina: 0.1, diesel: 99, gpl: "2", metano: 1.2 },
      lastAutomaticReference: { benzina: 1.7 },
      avoidMotorway: "sì",
      maxPriceAgeHours: 3.5,
    };
    const clean = sanitizeSettings(dirty);
    expect(clean.vehicle).toEqual(FACTORY_SETTINGS.vehicle);
    expect(clean.consumptionKmPerLiter).toBe(15);
    expect(clean.valueOfTimePerMinute).toBe(0.15);
    expect(clean.referenceMode).toBe("auto");
    expect(clean.manualReference).toEqual({ metano: 1.2 }); // solo il valore nell'intervallo 0,5–4
    expect(clean.lastAutomaticReference).toEqual({ benzina: 1.7 });
    expect(clean.avoidMotorway).toBe(false);
    expect(clean.maxPriceAgeHours).toBe(72);
  });

  it("V_time: 0,05 e 1,00 sono ammessi, 0,049 e 1,01 no", () => {
    expect(sanitizeSettings({ valueOfTimePerMinute: 0.05 }).valueOfTimePerMinute).toBe(0.05);
    expect(sanitizeSettings({ valueOfTimePerMinute: 1 }).valueOfTimePerMinute).toBe(1);
    expect(sanitizeSettings({ valueOfTimePerMinute: 0.049 }).valueOfTimePerMinute).toBe(0.15);
    expect(sanitizeSettings({ valueOfTimePerMinute: 1.01 }).valueOfTimePerMinute).toBe(0.15);
  });

  it("il modello è limitato a 60 caratteri", () => {
    expect(sanitizeSettings({ vehicle: { modelName: "x".repeat(100) } }).vehicle.modelName).toHaveLength(60);
  });
});

describe("Ripristina Predefiniti", () => {
  it("riporta tutto ai valori di fabbrica, incluso Automatico, ma conserva la cache dell'ultimo prezzo automatico", () => {
    const reset = factorySettings(custom());
    expect(reset).toEqual({ ...FACTORY_SETTINGS, lastAutomaticReference: { benzina: 1.85 } });
    expect(reset.referenceMode).toBe("auto");
    expect(reset.manualReference).toEqual({});
  });

  it("non condivide riferimenti con i valori di fabbrica (nessuna mutazione accidentale)", () => {
    const reset = factorySettings();
    reset.manualReference.benzina = 2;
    reset.vehicle.tankLiters = 80;
    expect(FACTORY_SETTINGS.manualReference).toEqual({});
    expect(FACTORY_SETTINGS.vehicle.tankLiters).toBe(45);
  });
});

describe("prezzo di riferimento manuale", () => {
  it("passando a Manuale pre-compila i campi vuoti con l'ultimo prezzo automatico noto, senza toccare quelli scritti", () => {
    const filled = prefillManualReference({
      ...FACTORY_SETTINGS,
      manualReference: { diesel: 1.77 },
      lastAutomaticReference: { benzina: 1.8543, diesel: 1.9, gpl: 0.82 },
    });
    expect(filled).toEqual({ diesel: 1.77, benzina: 1.854, gpl: 0.82 });
    expect(filled.metano).toBeUndefined(); // mai cercato: resta vuoto
  });

  it("referenceOverrideFor: solo in modalità Manuale e solo se c'è un valore per quel carburante", () => {
    const s = { ...custom(), referenceMode: "manual" as const, manualReference: { benzina: 1.9 } };
    expect(referenceOverrideFor(s, "benzina")).toBe(1.9);
    expect(referenceOverrideFor(s, "diesel")).toBeUndefined(); // vuoto → calcolo automatico
    expect(referenceOverrideFor({ ...s, referenceMode: "auto" }, "benzina")).toBeUndefined(); // Automatico: i valori manuali restano ma non contano
  });
});

describe("parseDecimal", () => {
  it("accetta virgola e punto, rifiuta il resto", () => {
    expect(parseDecimal("0,15")).toBe(0.15);
    expect(parseDecimal(" 15.5 ")).toBe(15.5);
    expect(parseDecimal("72")).toBe(72);
    expect(parseDecimal(".5")).toBe(0.5);
    for (const bad of ["", " ", "abc", "1,2,3", "-1", "1e3", "0x10", "∞"]) expect(parseDecimal(bad)).toBeNull();
  });
});

describe("samePreferences", () => {
  it("ignora la cache dell'ultimo prezzo automatico e l'ordine delle chiavi", () => {
    const a = custom();
    const b: Settings = { ...custom(), lastAutomaticReference: { gpl: 1 }, manualReference: { diesel: 1.8, benzina: 1.9 } };
    expect(samePreferences(a, b)).toBe(true);
  });

  it("rileva ogni preferenza modificata", () => {
    const base = custom();
    const variants: Settings[] = [
      { ...base, vehicle: { ...base.vehicle, tankLiters: 55 } },
      { ...base, consumptionKmPerLiter: 18 },
      { ...base, valueOfTimePerMinute: 0.31 },
      { ...base, referenceMode: "auto" },
      { ...base, manualReference: { benzina: 1.91, diesel: 1.8 } },
      { ...base, avoidMotorway: false },
      { ...base, maxPriceAgeHours: 49 },
    ];
    for (const v of variants) expect(samePreferences(base, v)).toBe(false);
  });
});
