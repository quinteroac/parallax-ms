/**
 * US-008: Automated tests for critical paths
 * Tests the job lifecycle: POST /v1/jobs → GET /v1/jobs/:id
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { app } from "./index";
import { clearJobs } from "./job-store";
import { clearListeners } from "./sse-emitter";

const BASE = "http://localhost";

describe("US-008 Automated tests for critical paths (Gateway)", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
  });

  // AC01 — POST /v1/jobs → GET /v1/jobs/:id status progression
  test("US-008-AC01: POST /v1/jobs creates a job and GET /v1/jobs/:id returns pending status", async () => {
    const createRes = await app.handle(
      new Request(`${BASE}/v1/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "text-to-image", params: { prompt: "a landscape" } }),
      }),
    );
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as Record<string, unknown>;
    expect(typeof createBody.jobId).toBe("string");

    const jobId = createBody.jobId as string;

    const getRes = await app.handle(new Request(`${BASE}/v1/jobs/${jobId}`));
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as Record<string, unknown>;
    expect(getBody.id).toBe(jobId);
    expect(["pending", "running"]).toContain(getBody.status as string);
    expect(typeof getBody.createdAt).toBe("string");
    expect(typeof getBody.updatedAt).toBe("string");
  });

  // AC02 — GET /v1/jobs/:id returns 404 for unknown id
  test("US-008-AC02: GET /v1/jobs/:id returns 404 for an unknown id", async () => {
    const res = await app.handle(
      new Request(`${BASE}/v1/jobs/00000000-0000-4000-8000-000000000000`),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBeDefined();
  });
});
