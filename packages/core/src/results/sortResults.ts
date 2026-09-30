import type { StationResult } from "@routefuel/shared";

/**
 * Ordinamenti della lista risultati (schermata Risultati), tutti applicabili lato client sui risultati già ricevuti:
 *
 * - `savings`  «Più conveniente»: risparmio netto decrescente.
 * - `detour`   «Minor deviazione»: km extra crescenti, a parità il risparmio maggiore.
 * - `on_route` «Sul percorso»: prima le stazioni realmente sulla strada (distanza laterale dal tracciato crescente),
 *   a pari distanza l'ordine di incontro partendo da A (`alongRouteKm` crescente), poi il risparmio maggiore.
 */
export type ResultSortMode = "savings" | "detour" | "on_route";

const bySavings = (a: StationResult, b: StationResult) => b.netSavings - a.netSavings;

const COMPARATORS: Record<ResultSortMode, (a: StationResult, b: StationResult) => number> = {
  savings: bySavings,
  detour: (a, b) => a.detourKm - b.detourKm || bySavings(a, b),
  on_route: (a, b) => a.lateralDistanceKm - b.lateralDistanceKm || a.alongRouteKm - b.alongRouteKm || bySavings(a, b),
};

/** Restituisce una nuova lista ordinata; l'input non viene modificato. */
export function sortResults(results: readonly StationResult[], mode: ResultSortMode): StationResult[] {
  return [...results].sort(COMPARATORS[mode]);
}
