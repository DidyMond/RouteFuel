import { checkDatabaseConnection, db } from "./db";
import { env } from "./env";
import { runIngestion } from "./ingestion/runIngestion";
import type { GeocodingProvider } from "./providers/geocoding/GeocodingProvider";
import { FixtureGeocodingProvider } from "./providers/geocoding/FixtureGeocodingProvider";
import { MapboxGeocodingProvider } from "./providers/geocoding/MapboxGeocodingProvider";
import { MimitFuelDataProvider } from "./providers/fuel-data/MimitFuelDataProvider";
import { BudgetedRoutingProvider } from "./providers/routing/BudgetedRoutingProvider";
import { CachedRoutingProvider } from "./providers/routing/CachedRoutingProvider";
import { type BudgetGate, DirectionsBudget } from "./providers/routing/DirectionsBudget";
import { MapboxRoutingProvider } from "./providers/routing/MapboxRoutingProvider";
import { MockRoutingProvider } from "./providers/routing/MockRoutingProvider";
import type { RoutingProvider } from "./providers/routing/RoutingProvider";
import { PostgisStationRepository } from "./search/PostgisStationRepository";
import { SearchService } from "./search/SearchService";
import { SearchSessionStore } from "./search/SearchSessionStore";
import { DbUsageCounter } from "./usage/UsageCounter";

function requireMapboxToken(purpose: string): string {
  if (!env.MAPBOX_SERVER_TOKEN) {
    throw new Error(`MAPBOX_SERVER_TOKEN è obbligatorio per ${purpose} (oppure imposta il provider su fixture/mock).`);
  }
  return env.MAPBOX_SERVER_TOKEN;
}

/** Provider effettivi scelti da env: Mapbox se c'è il token, altrimenti fixture/mock (sviluppo senza chiavi). */
export function createRuntime() {
  const geocodingKind = env.GEOCODING_PROVIDER ?? (env.MAPBOX_SERVER_TOKEN ? "mapbox" : "fixture");
  const routingKind = env.ROUTING_PROVIDER ?? (env.MAPBOX_SERVER_TOKEN ? "mapbox" : "mock");

  const geocoding: GeocodingProvider =
    geocodingKind === "mapbox"
      ? new MapboxGeocodingProvider({ token: requireMapboxToken("il geocoding Mapbox") })
      : new FixtureGeocodingProvider();

  let routing: RoutingProvider;
  let budget: BudgetGate;
  if (routingKind === "mapbox") {
    const directionsBudget = new DirectionsBudget({
      counter: new DbUsageCounter(db),
      softLimit: env.DIRECTIONS_SOFT_LIMIT,
      hardLimit: env.DIRECTIONS_HARD_LIMIT,
    });
    // Ordine: la cache sta sopra il conteggio, così le risposte in cache non consumano quota.
    routing = new CachedRoutingProvider(
      new BudgetedRoutingProvider(
        new MapboxRoutingProvider({ token: requireMapboxToken("il routing Mapbox") }),
        directionsBudget,
      ),
    );
    budget = directionsBudget;
  } else {
    routing = new MockRoutingProvider();
    budget = { status: async () => "ok" };
  }

  const searchService = new SearchService({
    routing,
    repository: new PostgisStationRepository(db),
    budget,
    sessions: new SearchSessionStore(),
  });

  return {
    geocoding,
    searchService,
    providers: { geocoding: geocodingKind, routing: routingKind },
    checkDatabase: checkDatabaseConnection,
    runIngestion: () => runIngestion(new MimitFuelDataProvider()),
  };
}
