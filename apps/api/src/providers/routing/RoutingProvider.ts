import type { Coordinate } from "@routefuel/core";
import type { LonLat } from "@routefuel/shared";

export interface RouteResult {
  distanceKm: number;
  durationMinutes: number;
  /** Tracciato completo, [lon, lat]. */
  geometry: Coordinate[];
}

/** Opzioni di una richiesta di percorso. */
export interface RouteOptions {
  /** Percorso senza autostrada (Directions `exclude=motorway`). */
  avoidMotorway?: boolean;
}

/**
 * Astrae il motore di routing (RouteFuel non ne costruisce uno proprio).
 * Implementazioni: MapboxRoutingProvider (produzione), MockRoutingProvider (test/dev senza chiavi).
 * Decoratori componibili: BudgetedRoutingProvider (kill switch), CachedRoutingProvider (TTL breve).
 */
export interface RoutingProvider {
  /**
   * Percorso guidabile che passa per i waypoint nell'ordine dato (almeno 2).
   * Restituisce null se non esiste un percorso; lancia un errore per problemi
   * di rete, credenziali o quota.
   */
  getRoute(waypoints: readonly LonLat[], options?: RouteOptions): Promise<RouteResult | null>;
}
