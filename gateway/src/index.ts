import { Elysia } from "elysia";

const parsed = Number.parseInt(process.env.PORT ?? "3000", 10);
const port = Number.isFinite(parsed) && parsed > 0 ? parsed : 3000;

const app = new Elysia().get("/", () => ({ ok: true, service: "parallax-gateway" }));

app.listen(port);

console.log(`Parallax gateway listening on http://localhost:${port}`);
