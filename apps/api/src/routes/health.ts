import type { HealthStatus } from "@routefuel/shared";
import type { FastifyInstance } from "fastify";

export function registerHealthRoutes(app: FastifyInstance, checkDatabase: () => Promise<boolean>): void {
  app.get("/health", async (_request, reply) => {
    const databaseOk = await checkDatabase();

    const body: HealthStatus = {
      status: databaseOk ? "ok" : "degraded",
      database: databaseOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    };

    reply.code(databaseOk ? 200 : 503).send(body);
  });
}
