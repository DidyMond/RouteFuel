import type { LonLat } from "@routefuel/shared";
import type { RouteOptions, RouteResult, RoutingProvider } from "./RoutingProvider";

export interface CachedRoutingProviderOptions {
  /** Durata di vita di una risposta in cache. Breve di proposito: nessuna persistenza dei risultati Mapbox. */
  ttlMs?: number;
  maxEntries?: number;
  now?: () => number;
}

interface Entry {
  expiresAt: number;
  promise: Promise<RouteResult | null>;
}

/**
 * Cache in memoria con TTL breve (10 minuti) e deduplica delle richieste in
 * corso: due ricerche identiche ravvicinate producono una sola chiamata al
 * provider. Le risposte non vengono mai salvate su database (vincolo sui
 * termini d'uso Mapbox per l'uso "temporaneo").
 */
export class CachedRoutingProvider implements RoutingProvider {
  private readonly entries = new Map<string, Entry>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;

  constructor(
    private readonly inner: RoutingProvider,
    options: CachedRoutingProviderOptions = {},
  ) {
    this.ttlMs = options.ttlMs ?? 10 * 60 * 1000;
    this.maxEntries = options.maxEntries ?? 200;
    this.now = options.now ?? Date.now;
  }

  getRoute(waypoints: readonly LonLat[], options?: RouteOptions): Promise<RouteResult | null> {
    const key = cacheKey(waypoints, options);
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) {
      return cached.promise;
    }

    const promise = this.inner.getRoute(waypoints, options);
    this.entries.set(key, { expiresAt: this.now() + this.ttlMs, promise });
    this.evictIfNeeded();

    // Gli errori (rete, quota) non si memorizzano: la prossima richiesta riprova.
    promise.catch(() => {
      if (this.entries.get(key)?.promise === promise) {
        this.entries.delete(key);
      }
    });

    return promise;
  }

  private evictIfNeeded(): void {
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) return;
      this.entries.delete(oldest);
    }
  }
}

/**
 * Coordinate arrotondate a 4 decimali (~11 m): richieste quasi identiche condividono la voce. Il percorso senza
 * autostrada è un'altra risposta: ha una chiave diversa.
 */
function cacheKey(waypoints: readonly LonLat[], options?: RouteOptions): string {
  const points = waypoints.map((point) => `${point.lon.toFixed(4)},${point.lat.toFixed(4)}`).join("|");
  return options?.avoidMotorway ? `${points}#no-motorway` : points;
}
