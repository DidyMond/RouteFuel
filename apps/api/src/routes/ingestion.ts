import type { FastifyInstance } from "fastify";
import { runIngestion } from "../ingestion/runIngestion";
import { MimitFuelDataProvider } from "../providers/fuel-data/MimitFuelDataProvider";

/**
 * Endpoint di ingestione manuale per la Milestone 0: nessuna autenticazione
 * (fuori scope MVP, vedi docs/PRD.md §4.1). Da NON esporre pubblicamente senza
 * protezione quando si passa a un ambiente diverso dallo sviluppo locale.
 */
export function registerIngestionRoutes(app: FastifyInstance): void {
  app.post("/ingest", async (_request, reply) => {
    try {
      const summary = await runIngestion(new MimitFuelDataProvider());
      reply.code(200).send(summary);
    } catch (error) {
      app.log.error(error);
      reply.code(502).send({
        error: "Ingestione fallita",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
