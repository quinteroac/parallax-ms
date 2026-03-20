import { config } from "@dotenvx/dotenvx";
import { Elysia } from "elysia";
import { join } from "node:path";

config({ path: join(import.meta.dir, "../.env") });

/** HTTP API (exported for tests and programmatic use). */
export const app = new Elysia()
  .get("/health", () => ({ status: "ok" as const }), {
    detail: { summary: "Liveness / readiness probe" },
  })
  .get("/", () => ({ ok: true, service: "parallax-gateway" }));

const parsed = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;

if (import.meta.main) {
  app.listen(port);
  console.log(`Parallax gateway listening on http://localhost:${port}`);
}
