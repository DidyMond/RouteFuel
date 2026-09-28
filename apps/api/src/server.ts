import cors from "@fastify/cors";
import Fastify from "fastify";
import { env } from "./env";
import { registerHealthRoutes } from "./routes/health";
import { registerIngestionRoutes } from "./routes/ingestion";

async function buildServer() {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: env.CORS_ORIGIN });

  registerHealthRoutes(app);
  registerIngestionRoutes(app);

  return app;
}

buildServer()
  .then((app) => app.listen({ port: env.API_PORT, host: env.API_HOST }))
  .catch((error) => {
    console.error("Avvio del server fallito:", error);
    process.exit(1);
  });
