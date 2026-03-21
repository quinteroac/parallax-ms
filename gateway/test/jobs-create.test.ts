import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { clearJobs, getJob } from "../src/job-store";
import type { ModelEntry, ModelsResponse } from "../src/model-store";
import { createJobsRoutes } from "../src/routes/jobs";

const BASE = "http://localhost";

const testModel: ModelEntry = {
  id: "test-model",
  name: "Test Model",
  type: "images",
  modalities: ["text-to-image", "image-to-image"],
  description: "Test model for unit tests",
  components: {},
};

const testLoader = (): ModelsResponse => ({
  images: [testModel],
  video: [],
  editing: [],
  audio: [],
  upscalers: [],
});

function makeApp(loader = testLoader) {
  return new Elysia().use(createJobsRoutes(loader));
}

function postJob(body: unknown, loader = testLoader) {
  return makeApp(loader).handle(
    new Request(`${BASE}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("US-001 POST /v1/jobs validates modelId and modality", () => {
  beforeEach(() => {
    clearJobs();
  });

  // AC01: required body shape
  test("AC01: accepts { modelId, modality, params } and returns 201", async () => {
    const res = await postJob({ modelId: "test-model", modality: "text-to-image", params: {} });
    expect(res.status).toBe(201);
  });

  test("AC01: params may be an empty object", async () => {
    const res = await postJob({ modelId: "test-model", modality: "text-to-image", params: {} });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["jobId"]);
  });

  // AC02: modelId validation
  test("AC02: missing modelId returns 400 with prescribed error", async () => {
    const res = await postJob({ modality: "text-to-image", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modelId` is required and must be a non-empty string");
  });

  test("AC02: empty string modelId returns 400", async () => {
    const res = await postJob({ modelId: "", modality: "text-to-image", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modelId` is required and must be a non-empty string");
  });

  test("AC02: non-string modelId returns 400", async () => {
    const res = await postJob({ modelId: 42, modality: "text-to-image", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modelId` is required and must be a non-empty string");
  });

  // AC03: model not found in config
  test("AC03: unknown modelId returns 422 with 'Model not found: <modelId>'", async () => {
    const res = await postJob({
      modelId: "nonexistent-model",
      modality: "text-to-image",
      params: {},
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Model not found: nonexistent-model");
  });

  // AC04: modality validation
  test("AC04: missing modality returns 400 with prescribed error", async () => {
    const res = await postJob({ modelId: "test-model", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modality` is required and must be a non-empty string");
  });

  test("AC04: empty string modality returns 400", async () => {
    const res = await postJob({ modelId: "test-model", modality: "", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modality` is required and must be a non-empty string");
  });

  test("AC04: non-string modality returns 400", async () => {
    const res = await postJob({ modelId: "test-model", modality: 123, params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("`modality` is required and must be a non-empty string");
  });

  // AC05: modality not in model's modalities
  test("AC05: unsupported modality returns 400 with prescribed error", async () => {
    const res = await postJob({ modelId: "test-model", modality: "video-generation", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Modality 'video-generation' is not supported by model 'test-model'");
  });

  // AC06: valid input returns 201 with { jobId }
  test("AC06: valid input returns 201 with { jobId: string }", async () => {
    const res = await postJob({
      modelId: "test-model",
      modality: "text-to-image",
      params: { prompt: "a cat" },
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  // AC07: stored job includes modelId, modality, type (derived), params
  test("AC07: stored job includes modelId, modality, type (from model config), and params", async () => {
    const res = await postJob({
      modelId: "test-model",
      modality: "image-to-image",
      params: { prompt: "a dog", strength: 0.8 },
    });
    expect(res.status).toBe(201);
    const { jobId } = (await res.json()) as { jobId: string };
    const job = getJob(jobId);
    expect(job).toBeDefined();
    expect(job!.modelId).toBe("test-model");
    expect(job!.modality).toBe("image-to-image");
    expect(job!.type).toBe("images"); // derived from testModel.type
    expect(job!.params).toEqual({ prompt: "a dog", strength: 0.8 });
  });

  // AC08: 503 when models config is unavailable
  test("AC08: returns 503 when models config is unavailable", async () => {
    const brokenLoader = () => {
      throw new Error("config file missing");
    };
    const res = await postJob(
      { modelId: "any-model", modality: "text-to-image", params: {} },
      brokenLoader,
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Model configuration unavailable");
  });

  test("AC08: 503 is returned even when modelId and modality are valid strings", async () => {
    const brokenLoader = () => {
      throw new Error("disk error");
    };
    const res = await postJob(
      { modelId: "test-model", modality: "text-to-image", params: {} },
      brokenLoader,
    );
    expect(res.status).toBe(503);
  });
});

const upscalerModel: ModelEntry = {
  id: "test-upscaler",
  name: "Test Upscaler",
  type: "upscalers",
  modalities: ["upscale"],
  description: "Test upscaler model for unit tests",
  components: { checkpoint: "test.pth" },
  architecture: "bundled-checkpoint",
};

const upscalerLoader = (): ModelsResponse => ({
  images: [],
  video: [],
  editing: [],
  audio: [],
  upscalers: [upscalerModel],
});

describe("US-002 POST /v1/jobs accepts and validates upscale jobs", () => {
  beforeEach(() => {
    clearJobs();
  });

  // AC01: upscale job with valid upscaler model returns 201
  test("AC01: modality 'upscale' with valid upscaler modelId returns 201 with { jobId }", async () => {
    const res = await postJob(
      {
        modelId: "test-upscaler",
        modality: "upscale",
        params: { source_image: "data:image/png;base64,abc" },
      },
      upscalerLoader,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { jobId: string };
    expect(typeof body.jobId).toBe("string");
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  // AC02: model that does not support 'upscale' returns 400
  test("AC02: model that does not support 'upscale' returns 400 with clear error", async () => {
    const res = await postJob({
      modelId: "test-model",
      modality: "upscale",
      params: { source_image: "img" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/not supported/i);
    expect(body.error).toContain("upscale");
  });

  // AC03: missing source_image in params returns 400
  test("AC03: missing source_image returns 400 with clear error", async () => {
    const res = await postJob(
      { modelId: "test-upscaler", modality: "upscale", params: {} },
      upscalerLoader,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/source_image/);
  });

  test("AC03: null source_image returns 400", async () => {
    const res = await postJob(
      { modelId: "test-upscaler", modality: "upscale", params: { source_image: null } },
      upscalerLoader,
    );
    expect(res.status).toBe(400);
  });
});
