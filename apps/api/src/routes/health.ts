import type { FastifyInstance } from "fastify";
import type { HealthStatus } from "@routefuel/shared";
import { checkDatabaseConnection } from "../db";

export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async (_request, reply) => {
    const databaseOk = await checkDatabaseConnection();

    const body: HealthStatus = {
      status: databaseOk ? "ok" : "degraded",
      database: databaseOk ? "ok" : "error",
      timestamp: new Date().toISOString(),
    };

    reply.code(databaseOk ? 200 : 503).send(body);
  });
}
