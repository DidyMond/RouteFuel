import { randomUUID } from "node:crypto";
import {
  computeNetSavings,
  computeReferencePrice,
  computeRoutedDetour,
  costPerKm,
  createRouteProjector,
  estimateProxyDetour,
  routeToWkt,
  selectStationPrice,
  simplifyRoute,
  type Detour,
  type PriceSample,
  type SelectedPrice,
  type StationPriceOption,
} from "@routefuel/core";
import type {
  DetourSource,
  RefinementInfo,
  SearchRefinementResponse,
  SearchRequest,
  SearchResponse,
  StationResult,
  StationSummary,
} from "@routefuel/shared";
import { AppError, BudgetExhaustedError } from "../errors";
import type { BudgetGate } from "../providers/routing/DirectionsBudget";
import type { RoutingProvider } from "../providers/routing/RoutingProvider";
import type { CorridorPriceRow, StationRepository } from "./StationRepository";
import type { SearchSession, SearchSessionStore } from "./SearchSessionStore";

/** Il raggio del corridoio segue lo slider della deviazione massima, ma entro questi limiti. */
export const MIN_CORRIDOR_RADIUS_KM = 1;
export const MAX_CORRIDOR_RADIUS_KM = 15;
/** Massimo di stazioni restituite (le migliori per risparmio netto). */
export const RESULT_LIMIT = 50;
/** Quante stazioni in testa alla classifica proxy vengono verificate con il routing reale. */
export const REFINE_TOP_N = 5;

export interface SearchServiceDeps {
  routing: RoutingProvider;
  repository: StationRepository;
  budget: BudgetGate;
  sessions: SearchSessionStore;
  now?: () => number;
  logger?: { warn(details: object, message: string): void };
}

interface Candidate {
  station: StationSummary;
  price: SelectedPrice;
  lateralDistanceKm: number;
  alongRouteKm: number;
}

interface ScoringContext {
  request: SearchRequest;
  referencePrice: number;
}

export class SearchService {
  private readonly now: () => number;

  constructor(private readonly deps: SearchServiceDeps) {
    this.now = deps.now ?? Date.now;
  }

  /**
   * Fase 1 (sincrona): percorso A→B, corridoio PostGIS, prezzo di riferimento,
   * ranking con deviazione stimata (proxy geometrico). Risponde subito.
   * Fase 2 (in background): verifica con routing reale delle prime
   * REFINE_TOP_N stazioni; il client legge l'esito con getRefinement().
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const route = await this.deps.routing.getRoute([request.origin, request.destination]);
    if (!route) {
      throw new AppError("NO_ROUTE", 422, "Nessun percorso stradale trovato tra origine e destinazione.");
    }

    const simplified = simplifyRoute(route.geometry);
    const radiusKm = clamp(request.maxDetourKm, MIN_CORRIDOR_RADIUS_KM, MAX_CORRIDOR_RADIUS_KM);

    const [rows, national, lastIngestionAt] = await Promise.all([
      this.deps.repository.findCorridorPrices({
        routeWkt: routeToWkt(simplified),
        radiusMeters: radiusKm * 1000,
        fuelType: request.fuelType,
        maxAgeHours: request.maxPriceAgeHours,
      }),
      this.deps.repository.getNationalPrice({
        fuelType: request.fuelType,
        onlySelf: request.onlySelf,
        maxAgeHours: request.maxPriceAgeHours,
      }),
      this.deps.repository.getLastIngestionAt(),
    ]);

    const project = createRouteProjector(simplified);
    const candidates: Candidate[] = [];
    for (const { summary, options } of groupByStation(rows)) {
      const price = selectStationPrice(options, { onlySelf: request.onlySelf });
      if (!price) continue;
      const { lateralDistanceKm, alongRouteKm } = project([summary.lon, summary.lat]);
      candidates.push({ station: summary, price, lateralDistanceKm, alongRouteKm });
    }

    const samples: PriceSample[] = candidates.map((c) => ({
      lateralDistanceKm: c.lateralDistanceKm,
      price: c.price.price,
    }));
    const reference = computeReferencePrice(samples, national);
    if (!reference) {
      throw new AppError(
        "NO_PRICE_DATA",
        422,
        "Prezzi aggiornati insufficienti per questo carburante: riprova più tardi o aumenta la soglia di validità dei prezzi.",
      );
    }

    const context: ScoringContext = { request, referencePrice: reference.value };
    const scored: StationResult[] = [];
    for (const candidate of candidates) {
      const detour = estimateProxyDetour(candidate.lateralDistanceKm);
      if (detour.km > request.maxDetourKm) continue;
      scored.push(scoreCandidate(candidate, detour, "proxy", context));
    }
    scored.sort(byNetSavings);

    const budget = await this.deps.budget.status();
    const results = scored.slice(0, RESULT_LIMIT);
    const routeMetrics = { distanceKm: route.distanceKm, durationMinutes: route.durationMinutes };

    const session: SearchSession = {
      id: randomUUID(),
      request,
      route: routeMetrics,
      referencePrice: { value: reference.value, level: reference.level, sampleSize: reference.sampleSize },
      costPerKm: costPerKm(reference.value, request.consumptionKmPerLiter),
      results,
      refinement: initialRefinement(budget, results.length),
      createdAt: this.now(),
    };
    this.deps.sessions.set(session);

    if (session.refinement.status === "pending") {
      session.refinementPromise = this.refine(session);
    }

    return {
      searchId: session.id,
      route: { distanceKm: round(route.distanceKm, 1), durationMinutes: round(route.durationMinutes, 0) },
      referencePrice: { ...session.referencePrice, value: round(session.referencePrice.value, 3) },
      costPerKm: round(session.costPerKm, 4),
      results: results.map(present),
      candidatesEvaluated: candidates.length,
      pricesUpdatedAt: lastIngestionAt ? lastIngestionAt.toISOString() : null,
      refinement: session.refinement,
    };
  }

  getRefinement(searchId: string): SearchRefinementResponse | null {
    const session = this.deps.sessions.get(searchId);
    if (!session) return null;
    return { searchId, refinement: session.refinement, results: session.results.map(present) };
  }

  /** Solo per i test: attende la fine del ricalcolo in background. */
  async waitForRefinement(searchId: string): Promise<void> {
    await this.deps.sessions.get(searchId)?.refinementPromise;
  }

  private async refine(session: SearchSession): Promise<void> {
    try {
      const { request, route } = session;
      const context: ScoringContext = { request, referencePrice: session.referencePrice.value };
      const top = session.results.slice(0, REFINE_TOP_N);

      let budgetReached = false;
      let failures = 0;

      const outcomes = await Promise.all(
        top.map(async (result) => {
          try {
            const via = await this.deps.routing.getRoute([
              request.origin,
              { lon: result.station.lon, lat: result.station.lat },
              request.destination,
            ]);
            if (!via) {
              failures += 1;
              return { result, detour: null };
            }
            return { result, detour: computeRoutedDetour(route, via) };
          } catch (error) {
            failures += 1;
            if (error instanceof BudgetExhaustedError) {
              budgetReached = true;
            } else {
              this.deps.logger?.warn({ stationId: result.station.id }, "Verifica routing della stazione non riuscita");
            }
            return { result, detour: null };
          }
        }),
      );

      const replacements = new Map<number, StationResult | null>(); // null = esclusa dal routing reale
      let verified = 0;
      for (const { result, detour } of outcomes) {
        if (!detour) continue;
        verified += 1;
        // Con i dati reali la deviazione massima resta il criterio finale di esclusione.
        replacements.set(
          result.station.id,
          detour.km > request.maxDetourKm ? null : rescore(result, detour, context),
        );
      }

      session.results = session.results
        .flatMap((result) => {
          const replacement = replacements.get(result.station.id);
          if (replacement === undefined) return [result];
          return replacement === null ? [] : [replacement];
        })
        .sort(byNetSavings);

      session.refinement = finalRefinement({ topCount: top.length, verified, failures, budgetReached });
    } catch (error) {
      this.deps.logger?.warn({ error: error instanceof Error ? error.message : String(error) }, "Ricalcolo in background fallito");
      session.refinement = { status: "failed", reason: "routing_error" };
    }
  }
}

function initialRefinement(budget: "ok" | "soft_limit" | "hard_limit", resultCount: number): RefinementInfo {
  if (budget === "soft_limit") return { status: "skipped", reason: "budget_soft_limit" };
  if (budget === "hard_limit") return { status: "skipped", reason: "budget_hard_limit" };
  if (resultCount === 0) return { status: "done" };
  return { status: "pending" };
}

function finalRefinement(outcome: {
  topCount: number;
  verified: number;
  failures: number;
  budgetReached: boolean;
}): RefinementInfo {
  if (outcome.budgetReached && outcome.verified === 0) {
    return { status: "skipped", reason: "budget_hard_limit" };
  }
  if (outcome.verified === 0 && outcome.failures > 0) {
    return { status: "failed", reason: "routing_error" };
  }
  return { status: "done" };
}

function scoreCandidate(
  candidate: Candidate,
  detour: Detour,
  source: DetourSource,
  context: ScoringContext,
): StationResult {
  const breakdown = computeNetSavings({
    referencePrice: context.referencePrice,
    stationPrice: candidate.price.price,
    liters: context.request.liters,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    consumptionKmPerLiter: context.request.consumptionKmPerLiter,
    valueOfTimePerMinute: context.request.valueOfTimePerMinute,
  });

  return {
    station: candidate.station,
    price: candidate.price.price,
    isSelf: candidate.price.isSelf,
    servitoOnly: candidate.price.servitoOnly,
    priceUpdatedAt: candidate.price.communicatedAt,
    lateralDistanceKm: candidate.lateralDistanceKm,
    alongRouteKm: candidate.alongRouteKm,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    detourSource: source,
    grossSavings: breakdown.grossSavings,
    detourCost: breakdown.detourFuelCost + breakdown.detourTimeCost,
    netSavings: breakdown.netSavings,
  };
}

/** Ricalcola risparmio e costi con la deviazione verificata, mantenendo prezzo e posizione. */
function rescore(result: StationResult, detour: Detour, context: ScoringContext): StationResult {
  const breakdown = computeNetSavings({
    referencePrice: context.referencePrice,
    stationPrice: result.price,
    liters: context.request.liters,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    consumptionKmPerLiter: context.request.consumptionKmPerLiter,
    valueOfTimePerMinute: context.request.valueOfTimePerMinute,
  });

  return {
    ...result,
    detourKm: detour.km,
    detourMinutes: detour.minutes,
    detourSource: "routing",
    grossSavings: breakdown.grossSavings,
    detourCost: breakdown.detourFuelCost + breakdown.detourTimeCost,
    netSavings: breakdown.netSavings,
  };
}

function groupByStation(rows: readonly CorridorPriceRow[]) {
  const grouped = new Map<number, { summary: StationSummary; options: StationPriceOption[] }>();
  for (const row of rows) {
    let entry = grouped.get(row.stationId);
    if (!entry) {
      entry = {
        summary: {
          id: row.stationId,
          nomeImpianto: row.nomeImpianto,
          bandiera: row.bandiera,
          gestore: row.gestore,
          indirizzo: row.indirizzo,
          comune: row.comune,
          provincia: row.provincia,
          tipoImpianto: row.tipoImpianto,
          lat: row.lat,
          lon: row.lon,
        },
        options: [],
      };
      grouped.set(row.stationId, entry);
    }
    entry.options.push({ isSelf: row.isSelf, price: row.price, communicatedAt: row.communicatedAt });
  }
  return grouped.values();
}

function byNetSavings(a: StationResult, b: StationResult): number {
  return b.netSavings - a.netSavings || a.detourKm - b.detourKm || a.station.id - b.station.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Arrotondamenti per la risposta API: la classifica interna resta sui valori pieni. */
function present(result: StationResult): StationResult {
  return {
    ...result,
    price: round(result.price, 3),
    lateralDistanceKm: round(result.lateralDistanceKm, 2),
    alongRouteKm: round(result.alongRouteKm, 1),
    detourKm: round(result.detourKm, 2),
    detourMinutes: round(result.detourMinutes, 1),
    grossSavings: round(result.grossSavings, 2),
    detourCost: round(result.detourCost, 2),
    netSavings: round(result.netSavings, 2),
  };
}
