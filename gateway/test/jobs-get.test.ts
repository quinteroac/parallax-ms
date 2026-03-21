import { beforeEach, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { app } from "../src/index";
import { clearJobs, createJob, updateJob } from "../src/job-store";
import { createJobsRoutes } from "../src/routes/jobs";

const BASE = "http://localhost";

// ---------- basic endpoint tests (via real app) ----------

function getJobStatus(id: string) {
  return app.handle(new Request(`${BASE}/v1/jobs/${id}`));
}

describe("US-003 Get job status", () => {
  beforeEach(() => {
    clearJobs();
  });

  test("US-003-AC01: GET /v1/jobs/:id returns 200 with id, status, createdAt, updatedAt", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const res = await getJobStatus(job.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.id).toBe(job.id);
    expect(body.status).toBe("pending");
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
  });

  test("US-003-AC02: Succeeded job includes url", async () => {
    const job = createJob("text-to-image", { prompt: "a dog" });
    updateJob(job.id, { status: "succeeded", url: "https://example.com/result.png" });
    const res = await getJobStatus(job.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("succeeded");
    expect(body.url).toBe("https://example.com/result.png");
  });

  test("US-003-AC03: Failed job includes error", async () => {
    const job = createJob("text-to-image", { prompt: "a bird" });
    updateJob(job.id, { status: "failed", error: "Worker unreachable: ECONNREFUSED" });
    const res = await getJobStatus(job.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("failed");
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });

  test("US-003-AC04: Unknown id returns 404", async () => {
    const res = await getJobStatus("00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
  });
});

// ---------- response shape tests (via isolated routes) ----------

function makeApp() {
  return new Elysia().use(createJobsRoutes());
}

function getJob(id: string) {
  return makeApp().handle(new Request(`${BASE}/v1/jobs/${id}`));
}

describe("US-002 GET /v1/jobs/:id response shape", () => {
  beforeEach(() => {
    clearJobs();
  });

  // AC01 + AC02: always-present fields
  test("AC01+AC02: pending job response includes id, status, createdAt, updatedAt, modelId, modality", async () => {
    const job = createJob("images", {}, { modelId: "flux-dev", modality: "text-to-image" });
    const res = await getJob(job.id);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("pending");
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.updatedAt).toBe("string");
    expect(body.modelId).toBe("flux-dev");
    expect(body.modality).toBe("text-to-image");
  });

  test("AC01: status field is one of the four allowed values", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(["pending", "running", "succeeded", "failed"]).toContain(body.status as string);
  });

  test("AC01: createdAt and updatedAt are ISO 8601 strings", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(() => new Date(body.createdAt as string).toISOString()).not.toThrow();
    expect(() => new Date(body.updatedAt as string).toISOString()).not.toThrow();
  });

  // AC03: url only on succeeded
  test("AC03: url is present when status is succeeded", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    updateJob(job.id, { status: "succeeded", url: "https://cdn.example.com/out.png" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("succeeded");
    expect(body.url).toBe("https://cdn.example.com/out.png");
    expect("error" in body).toBe(false);
  });

  test("AC03: url is absent when status is pending", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect("url" in body).toBe(false);
  });

  test("AC03: url is absent when status is failed (even if job has url set)", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    updateJob(job.id, { status: "failed", error: "inference error" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("failed");
    expect("url" in body).toBe(false);
  });

  // AC04: error only on failed
  test("AC04: error is present when status is failed", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    updateJob(job.id, { status: "failed", error: "OOM: CUDA out of memory" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("failed");
    expect(body.error).toBe("OOM: CUDA out of memory");
    expect("url" in body).toBe(false);
  });

  test("AC04: error is absent when status is pending", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect("error" in body).toBe(false);
  });

  test("AC04: error is absent when status is succeeded", async () => {
    const job = createJob("images", {}, { modelId: "m1", modality: "text-to-image" });
    updateJob(job.id, { status: "succeeded", url: "https://cdn.example.com/out.png" });
    const res = await getJob(job.id);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("succeeded");
    expect("error" in body).toBe(false);
  });

  // AC05: 404 for unknown ID
  test("AC05: unknown id returns 404 with { error: 'Job not found' }", async () => {
    const res = await getJob("00000000-0000-4000-8000-000000000000");
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Job not found");
  });
});
