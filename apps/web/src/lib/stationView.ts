import type { SearchFuelType, StationResult } from "@routefuel/shared";

/**
 * Ordinamento e filtri della lista risultati, tutti lato client: cambiare filtro non fa alcuna chiamata di rete.
 *
 * - `savings`  «Più conveniente»: risparmio netto decrescente (l'ordine del server).
 * - `detour`   «Minor deviazione»: km extra crescenti.
 * - `on_route` «Sul percorso»: distanza laterale dal tracciato crescente (le stazioni più "sulla strada" per prime).
 *   Interpretazione provvisoria, vedi docs/OPEN_QUESTIONS.md.
 */
export type SortMode = "savings" | "detour" | "on_route";

export interface ResultFilters {
  sort: SortMode;
  /** Nasconde le stazioni che hanno solo il servito. */
  onlySelf: boolean;
  /** Solo `Tipo Impianto = Autostradale`. */
  motorwayOnly: boolean;
}

export const DEFAULT_SORT: SortMode = "savings";

const bySavings = (a: StationResult, b: StationResult) => b.netSavings - a.netSavings;

const COMPARATORS: Record<SortMode, (a: StationResult, b: StationResult) => number> = {
  savings: bySavings,
  detour: (a, b) => a.detourKm - b.detourKm || bySavings(a, b),
  on_route: (a, b) => a.lateralDistanceKm - b.lateralDistanceKm || bySavings(a, b),
};

/** Restituisce una nuova lista filtrata e ordinata; l'input non viene modificato. */
export function applyFilters(results: readonly StationResult[], filters: ResultFilters): StationResult[] {
  return results
    .filter((r) => (filters.onlySelf ? r.isSelf : true))
    .filter((r) => (filters.motorwayOnly ? r.station.tipoImpianto === "autostradale" : true))
    .sort(COMPARATORS[filters.sort]);
}

/**
 * La stazione «Migliore» è quella con il maggior risparmio netto tra quelle visibili,
 * indipendentemente dall'ordinamento scelto, e solo se conviene davvero (> 0).
 */
export function bestStationId(results: readonly StationResult[]): number | null {
  let best: StationResult | null = null;
  for (const r of results) {
    if (r.netSavings > 0 && (best === null || r.netSavings > best.netSavings)) best = r;
  }
  return best ? best.station.id : null;
}

/** Iniziali per l'avatar del brand, da `Bandiera` (es. "Agip Eni" → "AE", "COIL" → "CO"). */
export function brandInitials(bandiera: string, fallback = ""): string {
  const source = bandiera.trim() || fallback.trim();
  const words = source.split(/[\s\-_/.&]+/).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return [...words[0]!].slice(0, 2).join("").toUpperCase();
  return (firstLetter(words[0]!) + firstLetter(words[1]!)).toUpperCase();
}

function firstLetter(word: string): string {
  return [...word].find((c) => /[\p{L}\p{N}]/u.test(c)) ?? "";
}

/**
 * Nome breve di un luogo per la capsula sulla mappa. Le etichette del geocoding sono del tipo
 * "Via Roma 3, 20816 Ceriano Laghetto provincia di Monza e della Brianza, Italia": interessa la località.
 */
export function shortPlaceName(label: string): string {
  const parts = label.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0]!;
  const locality = parts[1]!
    .replace(/^\d{5}\s+/, "")
    .replace(/\s+(provincia|città metropolitana|citta metropolitana)\b.*$/i, "")
    .trim();
  return locality && !/^\d+$/.test(locality) ? locality : parts[0]!;
}

const FUEL_LABEL: Record<SearchFuelType, string> = {
  benzina: "Benzina",
  diesel: "Diesel",
  gpl: "GPL",
  metano: "Metano",
};

/** "Benzina Self" / "Diesel Servito", come sotto il prezzo nella card. */
export function fuelModeLabel(fuelType: SearchFuelType, isSelf: boolean): string {
  return `${FUEL_LABEL[fuelType]} ${isSelf ? "Self" : "Servito"}`;
}
