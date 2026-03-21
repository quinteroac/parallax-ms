import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { clearJobs, createJob } from "./job-store";
import { enqueueJob, queue } from "./queue";

const gatewayRoot = join(import.meta.dir, "..");
const originalFetch = global.fetch;
const originalModelsConfigPath = process.env.MODELS_CONFIG_PATH;

describe("US-001 (it_000006) Gateway forwards model fields to worker /infer", () => {
  beforeEach(() => {
    clearJobs();
    queue.clear();
    process.env.MODELS_CONFIG_PATH = join(gatewayRoot, "../models.config.json");
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

  test("US-001-AC01: body includes modelId, modality, architecture, components when job has modelId", async () => {
    let capturedBody: unknown;

    global.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const job = createJob(
      "images",
      { prompt: "a cat" },
      {
        modelId: "wai-illustrious-sdxl-v160",
        modality: "text-to-image",
      },
    );
    enqueueJob(job);
    await queue.onIdle();

    expect(capturedBody).toMatchObject({
      id: job.id,
      modelId: "wai-illustrious-sdxl-v160",
      modality: "text-to-image",
      architecture: "bundled-checkpoint",
      components: { checkpoint: "waiIllustriousSDXL_v160.safetensors" },
    });
  });

  test("US-001-AC01: body does not include model fields when job has no modelId", async () => {
    let capturedBody: unknown;

    global.fetch = mock(async (_input: unknown, init?: RequestInit) => {
      capturedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const job = createJob("text-to-image", { prompt: "a cat" });
    enqueueJob(job);
    await queue.onIdle();

    const body = capturedBody as Record<string, unknown>;
    expect(body.modelId).toBeUndefined();
    expect(body.architecture).toBeUndefined();
    expect(body.components).toBeUndefined();
  });

  test("US-001-AC01: job fails if modelId is not found in config", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const job = createJob(
      "images",
      { prompt: "a cat" },
      {
        modelId: "nonexistent-model-id",
        modality: "text-to-image",
      },
    );
    enqueueJob(job);
    await queue.onIdle();

    const { getJob } = await import("./job-store");
    const stored = getJob(job.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.error).toMatch(/Model not found/);
  });
});
