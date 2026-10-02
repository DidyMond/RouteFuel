import type { SearchFuelType } from "@routefuel/shared";
import { CONSUMPTION_RANGE, FUEL_OPTIONS, LITERS_RANGE, SEARCH_DEFAULTS } from "./defaults";

/**
 * Impostazioni dell'utente (Screen 5), solo in `localStorage` con chiave versionata. Non contengono indirizzi né
 * coordinate: nulla di ciò che l'utente cerca viene salvato (vincolo sui termini d'uso di Mapbox: niente geocoding
 * persistente). Ogni lettura/scrittura è protetta: con lo storage assente o bloccato l'app usa una copia in memoria.
 */
export const SETTINGS_KEY = "routefuel.settings.v1";
export const SETTINGS_VERSION = 1;

export type BodyType = "berlina" | "suv" | "wagon" | "moto" | "furgone";

export const BODY_TYPES: ReadonlyArray<{ value: BodyType; label: string }> = [
  { value: "berlina", label: "Berlina" },
  { value: "suv", label: "SUV" },
  { value: "wagon", label: "Wagon" },
  { value: "moto", label: "Moto" },
  { value: "furgone", label: "Furgone" },
];

export type ReferenceMode = "auto" | "manual";

/** Prezzo per carburante, €/L. */
export type FuelPrices = Partial<Record<SearchFuelType, number>>;

export interface Settings {
  vehicle: {
    bodyType: BodyType;
    /** Testo libero, solo per riconoscere il profilo: non entra in alcun calcolo. */
    modelName: string;
    /** Capacità del serbatoio, L: precompila «Litri» nella ricerca. */
    tankLiters: number;
    defaultFuel: SearchFuelType;
  };
  /** Consumo medio misto, km/L. */
  consumptionKmPerLiter: number;
  /** Valore del tempo, €/minuto (V_time). */
  valueOfTimePerMinute: number;
  referenceMode: ReferenceMode;
  /** Prezzi di riferimento manuali per carburante; contano solo con `referenceMode = "manual"`. */
  manualReference: FuelPrices;
  /**
   * Ultimo prezzo di riferimento AUTOMATICO calcolato per carburante (da una ricerca): non è una preferenza ma una
   * cache, serve a precompilare i campi quando si passa a «Manuale». Il ripristino dei valori di fabbrica la conserva.
   */
  lastAutomaticReference: FuelPrices;
  /** «Evita autostrada»: percorsi senza autostrada (diretto e verifiche). */
  avoidMotorway: boolean;
  /** Prezzi comunicati da più di N ore sono esclusi. */
  maxPriceAgeHours: number;
}

export const V_TIME_RANGE = { min: 0.05, max: 1 } as const;
export const TANK_RANGE = LITERS_RANGE;
export const FRESHNESS_RANGE = { min: 1, max: 720 } as const;
export const REFERENCE_PRICE_RANGE = { min: 0.5, max: 4 } as const;

export const FACTORY_SETTINGS: Settings = {
  vehicle: {
    bodyType: "berlina",
    modelName: "",
    tankLiters: SEARCH_DEFAULTS.liters,
    defaultFuel: SEARCH_DEFAULTS.fuelType,
  },
  consumptionKmPerLiter: SEARCH_DEFAULTS.consumptionKmPerLiter,
  valueOfTimePerMinute: SEARCH_DEFAULTS.valueOfTimePerMinute,
  referenceMode: "auto",
  manualReference: {},
  lastAutomaticReference: {},
  avoidMotorway: false,
  maxPriceAgeHours: SEARCH_DEFAULTS.maxPriceAgeHours,
};

const FUELS = FUEL_OPTIONS.map((o) => o.value);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

function sanitizePrices(raw: unknown): FuelPrices {
  const out: FuelPrices = {};
  if (!isRecord(raw)) return out;
  for (const fuel of FUELS) {
    const value = raw[fuel];
    if (inRange(value, REFERENCE_PRICE_RANGE.min, REFERENCE_PRICE_RANGE.max)) out[fuel] = value;
  }
  return out;
}

/** Ricostruisce impostazioni valide da dati di provenienza qualunque: ogni campo non valido torna al valore di fabbrica. */
export function sanitizeSettings(raw: unknown): Settings {
  const f = FACTORY_SETTINGS;
  if (!isRecord(raw)) return structuredClone(f);
  const vehicle = isRecord(raw.vehicle) ? raw.vehicle : {};
  return {
    vehicle: {
      bodyType: BODY_TYPES.some((b) => b.value === vehicle.bodyType) ? (vehicle.bodyType as BodyType) : f.vehicle.bodyType,
      modelName: typeof vehicle.modelName === "string" ? vehicle.modelName.slice(0, 60) : f.vehicle.modelName,
      tankLiters: inRange(vehicle.tankLiters, TANK_RANGE.min, TANK_RANGE.max) ? vehicle.tankLiters : f.vehicle.tankLiters,
      defaultFuel: FUELS.includes(vehicle.defaultFuel as SearchFuelType) ? (vehicle.defaultFuel as SearchFuelType) : f.vehicle.defaultFuel,
    },
    consumptionKmPerLiter: inRange(raw.consumptionKmPerLiter, CONSUMPTION_RANGE.min, CONSUMPTION_RANGE.max)
      ? raw.consumptionKmPerLiter
      : f.consumptionKmPerLiter,
    valueOfTimePerMinute: inRange(raw.valueOfTimePerMinute, V_TIME_RANGE.min, V_TIME_RANGE.max) ? raw.valueOfTimePerMinute : f.valueOfTimePerMinute,
    referenceMode: raw.referenceMode === "manual" ? "manual" : "auto",
    manualReference: sanitizePrices(raw.manualReference),
    lastAutomaticReference: sanitizePrices(raw.lastAutomaticReference),
    avoidMotorway: raw.avoidMotorway === true,
    maxPriceAgeHours:
      inRange(raw.maxPriceAgeHours, FRESHNESS_RANGE.min, FRESHNESS_RANGE.max) && Number.isInteger(raw.maxPriceAgeHours)
        ? raw.maxPriceAgeHours
        : f.maxPriceAgeHours,
  };
}

/** Copia in memoria: vale quando lo storage non è disponibile. */
let memory: Settings | null = null;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw === null) return memory ? structuredClone(memory) : structuredClone(FACTORY_SETTINGS);
    const parsed: unknown = JSON.parse(raw);
    // Versione sconosciuta (futura o danneggiata): non si interpreta, si riparte dai valori di fabbrica.
    if (!isRecord(parsed) || parsed.version !== SETTINGS_VERSION) return structuredClone(FACTORY_SETTINGS);
    return sanitizeSettings(parsed.settings);
  } catch {
    return memory ? structuredClone(memory) : structuredClone(FACTORY_SETTINGS);
  }
}

export function saveSettings(settings: Settings): void {
  memory = structuredClone(settings);
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, settings }));
  } catch {
    // storage pieno o bloccato: resta la copia in memoria
  }
}

/** Solo per i test: azzera la copia in memoria. */
export function resetSettingsMemory(): void {
  memory = null;
}

/** Valori di fabbrica, conservando la cache dell'ultimo prezzo di riferimento automatico. */
export function factorySettings(keep: Pick<Settings, "lastAutomaticReference"> = FACTORY_SETTINGS): Settings {
  return { ...structuredClone(FACTORY_SETTINGS), lastAutomaticReference: { ...keep.lastAutomaticReference } };
}

/**
 * Passando a «Manuale» ogni campo vuoto si pre-compila con l'ultimo prezzo di riferimento automatico noto per quel
 * carburante; i valori già inseriti non si toccano. Un carburante mai cercato resta vuoto.
 */
export function prefillManualReference(settings: Settings): FuelPrices {
  const filled: FuelPrices = { ...settings.manualReference };
  for (const fuel of FUELS) {
    const last = settings.lastAutomaticReference[fuel];
    if (filled[fuel] === undefined && last !== undefined) filled[fuel] = Math.round(last * 1000) / 1000;
  }
  return filled;
}

/**
 * Prezzo di riferimento manuale da inviare per il carburante cercato: definito solo in modalità «Manuale» e se per
 * quel carburante c'è un valore; altrimenti la ricerca usa il calcolo automatico.
 */
export function referenceOverrideFor(settings: Settings, fuelType: SearchFuelType): number | undefined {
  if (settings.referenceMode !== "manual") return undefined;
  const value = settings.manualReference[fuelType];
  return inRange(value, REFERENCE_PRICE_RANGE.min, REFERENCE_PRICE_RANGE.max) ? value : undefined;
}

/** Parsing di un numero digitato (virgola o punto decimale); null se non è un numero valido. */
export function parseDecimal(text: string): number | null {
  const normalized = text.trim().replace(",", ".");
  if (normalized === "" || !/^\d*\.?\d+$|^\d+\.$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

/** Due impostazioni coincidono per le preferenze (la cache dell'ultimo prezzo automatico non conta; l'ordine delle chiavi neppure). */
export function samePreferences(a: Settings, b: Settings): boolean {
  const key = (s: Settings) =>
    JSON.stringify([s.vehicle, s.consumptionKmPerLiter, s.valueOfTimePerMinute, s.referenceMode, FUELS.map((f) => s.manualReference[f] ?? null), s.avoidMotorway, s.maxPriceAgeHours]);
  return key(a) === key(b);
}
