import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { ApiErrorBody } from "@routefuel/shared";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./errors";
import type { GeocodingProvider } from "./providers/geocoding/GeocodingProvider";
import { registerGeocodeRoutes } from "./routes/geocode";
import { registerHealthRoutes } from "./routes/health";
import { registerIngestionRoutes } from "./routes/ingestion";
import { registerSearchRoutes } from "./routes/search";
import type { SearchService } from "./search/SearchService";

export interface AppOptions {
  /** false nei test. */
  logger: boolean;
  /** Solo per i test: destinazione dei log al posto di stdout. */
  logStream?: NodeJS.WritableStream;
  trustProxy: boolean;
  corsOrigin: string;
  searchService: SearchService;
  geocoding: GeocodingProvider;
  searchRateLimitPerMinute: number;
  geocodeRateLimitPerMinute: number;
  checkDatabase: () => Promise<boolean>;
  runIngestion: () => Promise<object>;
}

/**
 * Factory dell'app, senza dipendenze da env/DB a livello di modulo: i test la
 * istanziano con provider fittizi e usano `app.inject()`.
 */
export async function buildApp(options: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: options.trustProxy,
    logger: options.logger
      ? {
          level: "info",
          stream: options.logStream,
          serializers: {
            // Mai loggare la query string: contiene gli indirizzi digitati dall'utente.
            req: (request) => ({ method: request.method, url: request.url.split("?")[0] }),
          },
        }
      : false,
  });

  await app.register(cors, { origin: options.corsOrigin });
  // global: false → il limite si applica solo alle rotte che lo dichiarano (search, geocode).
  await app.register(rateLimit, { global: false });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const send = (status: number, code: ApiErrorBody["error"]["code"], message: string) =>
      reply.code(status).send({ error: { code, message } } satisfies ApiErrorBody);

    if (error instanceof ZodError) {
      const issue = error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      return send(400, "VALIDATION_ERROR", `${where}${issue?.message ?? "Richiesta non valida"}`);
    }
    if (error instanceof AppError) {
      return send(error.httpStatus, error.code, error.message);
    }

    const statusCode = (error as FastifyError).statusCode;
    if (statusCode === 429) {
      return send(429, "RATE_LIMITED", "Troppe richieste: attendi qualche istante e riprova.");
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return send(statusCode, "VALIDATION_ERROR", "Richiesta non valida.");
    }

    request.log.error(error);
    return send(500, "INTERNAL_ERROR", "Errore interno del server.");
  });

  registerHealthRoutes(app, options.checkDatabase);
  registerIngestionRoutes(app, options.runIngestion);
  registerSearchRoutes(app, {
    service: options.searchService,
    searchRateLimitPerMinute: options.searchRateLimitPerMinute,
  });
  registerGeocodeRoutes(app, {
    provider: options.geocoding,
    rateLimitPerMinute: options.geocodeRateLimitPerMinute,
  });

  return app;
}
