import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Elysia } from "elysia";
import { clearJobs, createJob } from "./job-store";
import { clearListeners } from "./sse-emitter";
import { createJobsRoutes } from "./routes/jobs";
import { workerRoutes } from "./routes/worker";
import { outputsRoutes } from "./routes/outputs";
import { queue } from "./queue";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");
const repoRoot = join(gatewayRoot, "..");

const originalFetch = global.fetch;
const originalModelsConfigPath = process.env.MODELS_CONFIG_PATH;

const sseApp = new Elysia().use(createJobsRoutes()).use(workerRoutes);

describe("US-004 (it_000006) txt2img end-to-end verified", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
    queue.clear();
    process.env.MODELS_CONFIG_PATH = join(repoRoot, "models.config.json");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalModelsConfigPath === undefined) {
      delete process.env.MODELS_CONFIG_PATH;
    } else {
      process.env.MODELS_CONFIG_PATH = originalModelsConfigPath;
    }
  });

  // ---------- AC01 ----------

  test("AC01: POST /v1/jobs with txt2img modality and prompt returns 201 with jobId", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const app = new Elysia().use(createJobsRoutes()).use(workerRoutes);
    const res = await app.handle(
      new Request(`${BASE}/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "wai-illustrious-sdxl-v160",
          modality: "txt2img",
          params: { prompt: "a serene landscape" },
        }),
      }),
    );

    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  test("AC01: params beyond prompt (width, height, steps) are accepted", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const app = new Elysia().use(createJobsRoutes()).use(workerRoutes);
    const res = await app.handle(
      new Request(`${BASE}/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "wai-illustrious-sdxl-v160",
          modality: "txt2img",
          params: { prompt: "a cat", width: 1024, height: 1024, steps: 30 },
        }),
      }),
    );

    expect(res.status).toBe(201);
  });

  // ---------- AC03 ----------

  test("AC03: after worker callback, GET /v1/jobs/:id returns succeeded with url", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const app = new Elysia().use(createJobsRoutes()).use(workerRoutes);

    const createRes = await app.handle(
      new Request(`${BASE}/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "wai-illustrious-sdxl-v160",
          modality: "txt2img",
          params: { prompt: "mountains at dawn" },
        }),
      }),
    );
    const { jobId } = (await createRes.json()) as { jobId: string };
    await queue.onIdle();

    const imageUrl = `http://localhost:3000/outputs/${jobId}.png`;
    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: jobId, url: imageUrl }),
      }),
    );

    const jobRes = await app.handle(new Request(`${BASE}/v1/jobs/${jobId}`));
    expect(jobRes.status).toBe(200);
    const job = (await jobRes.json()) as Record<string, unknown>;
    expect(job.status).toBe("succeeded");
    expect(job.url).toBe(imageUrl);
    expect(job.error).toBeUndefined();
  });

  test("AC03: succeeded response includes modelId and modality", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const app = new Elysia().use(createJobsRoutes()).use(workerRoutes);

    const createRes = await app.handle(
      new Request(`${BASE}/v1/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: "wai-illustrious-sdxl-v160",
          modality: "txt2img",
          params: { prompt: "a forest" },
        }),
      }),
    );
    const { jobId } = (await createRes.json()) as { jobId: string };
    await queue.onIdle();

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: jobId,
          url: `http://localhost:3000/outputs/${jobId}.png`,
        }),
      }),
    );

    const jobRes = await app.handle(new Request(`${BASE}/v1/jobs/${jobId}`));
    const job = (await jobRes.json()) as Record<string, unknown>;
    expect(job.modelId).toBe("wai-illustrious-sdxl-v160");
    expect(job.modality).toBe("txt2img");
  });

  // ---------- AC04 ----------

  test("AC04: SSE event fires with succeeded status and url after worker callback", async () => {
    const job = createJob("images", { prompt: "a river valley" }, { modality: "txt2img" });

    const sseRes = await sseApp.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get("content-type")).toContain("text/event-stream");

    const imageUrl = `http://localhost:3000/outputs/${job.id}.png`;
    await sseApp.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: job.id, url: imageUrl }),
      }),
    );

    const text = await sseRes.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.id).toBe(job.id);
    expect(payload.status).toBe("succeeded");
    expect(payload.url).toBe(imageUrl);
    expect(payload.error).toBeUndefined();
  });

  // ---------- AC05 ----------

  test("AC05: GET /outputs/:filename serves the image file with image/png content-type", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "parallax-us004-"));
    const origOutputDir = process.env.OUTPUT_DIR;
    process.env.OUTPUT_DIR = tmpDir;

    try {
      writeFileSync(join(tmpDir, "test-us004.png"), Buffer.alloc(8, 0));

      const app = new Elysia().use(outputsRoutes);
      const res = await app.handle(new Request(`${BASE}/outputs/test-us004.png`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("image/png");
    } finally {
      if (origOutputDir === undefined) {
        delete process.env.OUTPUT_DIR;
      } else {
        process.env.OUTPUT_DIR = origOutputDir;
      }
    }
  });

  test("AC05: GET /outputs/:filename returns 404 when file does not exist", async () => {
    const app = new Elysia().use(outputsRoutes);
    const res = await app.handle(new Request(`${BASE}/outputs/nonexistent-us004.png`));
    expect(res.status).toBe(404);
  });

  // ---------- typecheck + lint ----------

  test("typecheck and lint pass", () => {
    const typecheck = Bun.spawnSync(["bun", "run", "typecheck"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(typecheck.exitCode, typecheck.stderr.toString()).toBe(0);

    const lint = Bun.spawnSync(["bun", "run", "lint"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(lint.exitCode, lint.stderr.toString()).toBe(0);
  });
});
