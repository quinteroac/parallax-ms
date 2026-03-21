import { config } from "@dotenvx/dotenvx";
import { Elysia } from "elysia";
import { join } from "node:path";
import { loadModels } from "./model-store";
import { jobsRoutes } from "./routes/jobs";
import { modelsRoutes } from "./routes/models";
import { outputsRoutes } from "./routes/outputs";
import { playgroundRoutes } from "./routes/playground";
import { workerRoutes } from "./routes/worker";

config({ path: join(import.meta.dir, "../.env") });

/** HTTP API (exported for tests and programmatic use). */
export const app = new Elysia()
  .get("/health", () => ({ status: "ok" as const }), {
    detail: { summary: "Liveness / readiness probe" },
  })
  .get("/", () => ({ ok: true, service: "parallax-gateway" }))
  .use(jobsRoutes)
  .use(modelsRoutes)
  .use(outputsRoutes)
  .use(workerRoutes)
  .use(playgroundRoutes);

const parsed = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;

if (import.meta.main) {
  try {
    loadModels();
    console.log("[models] Configuration loaded and validated successfully.");
  } catch (err) {
    console.error(
      "[models] Configuration error:",
      err instanceof Error ? err.message : String(err),
    );
  }

  app.listen(port);
  console.log(`Parallax gateway listening on http://localhost:${port}`);
}
