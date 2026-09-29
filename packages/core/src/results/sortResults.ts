import type { StationResult } from "@routefuel/shared";

/**
 * Ordinamenti della lista risultati (schermata Risultati), tutti applicabili lato client sui risultati già ricevuti:
 *
 * - `savings`  «Più conveniente»: risparmio netto decrescente.
 * - `detour`   «Minor deviazione»: km extra crescenti.
 * - `on_route` «Sul percorso»: **ordine di percorrenza**, cioè la stazione che si incontra per prima partendo da A
 *   viene prima (`alongRouteKm` crescente, la posizione della stazione misurata lungo il tracciato).
 */
export type ResultSortMode = "savings" | "detour" | "on_route";

const bySavings = (a: StationResult, b: StationResult) => b.netSavings - a.netSavings;

const COMPARATORS: Record<ResultSortMode, (a: StationResult, b: StationResult) => number> = {
  savings: bySavings,
  detour: (a, b) => a.detourKm - b.detourKm || bySavings(a, b),
  // A pari posizione lungo il percorso (due stazioni affacciate allo stesso punto) prima la più vicina alla strada.
  on_route: (a, b) => a.alongRouteKm - b.alongRouteKm || a.lateralDistanceKm - b.lateralDistanceKm || bySavings(a, b),
};

/** Restituisce una nuova lista ordinata; l'input non viene modificato. */
export function sortResults(results: readonly StationResult[], mode: ResultSortMode): StationResult[] {
  return [...results].sort(COMPARATORS[mode]);
}
