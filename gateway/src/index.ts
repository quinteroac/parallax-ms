import { config } from "@dotenvx/dotenvx";
import { Elysia } from "elysia";
import { join } from "node:path";

config({ path: join(import.meta.dir, "../.env") });

const parsed = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;

const app = new Elysia().get("/", () => ({ ok: true, service: "parallax-gateway" }));

app.listen(port);

console.log(`Parallax gateway listening on http://localhost:${port}`);
