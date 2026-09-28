import type { FastifyInstance } from "fastify";

/**
 * Endpoint di ingestione manuale (Milestone 0): nessuna autenticazione
 * (fuori scope MVP, vedi docs/PRD.md §4.1). Da NON esporre pubblicamente senza
 * protezione quando si passa a un ambiente diverso dallo sviluppo locale.
 */
export function registerIngestionRoutes(app: FastifyInstance, runIngestion: () => Promise<object>): void {
  app.post("/ingest", async (_request, reply) => {
    try {
      const summary = await runIngestion();
      reply.code(200).send(summary);
    } catch (error) {
      app.log.error(error);
      reply.code(502).send({
        error: { code: "PROVIDER_ERROR", message: error instanceof Error ? error.message : String(error) },
      });
    }
  });
}
