import { beforeEach, describe, expect, test } from "bun:test";
import { app } from "./index";
import { clearJobs, getJob } from "./job-store";

const BASE = "http://localhost";

function postJob(body: unknown) {
  return app.handle(
    new Request(`${BASE}/v1/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("US-001 Create a job", () => {
  beforeEach(() => {
    clearJobs();
  });

  test("US-001-AC01: POST /v1/jobs accepts { type: string, params: object }", async () => {
    const res = await postJob({ type: "text-to-image", params: { prompt: "a cat" } });
    expect(res.status).toBe(201);
  });

  test("US-001-AC02: Gateway assigns UUID jobId and stores pending state in the in-memory map", async () => {
    const res = await postJob({ type: "text-to-image", params: { prompt: "a cat" } });
    const body = (await res.json()) as { jobId: string };

    // jobId is a valid UUID v4
    expect(body.jobId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );

    // Stored state matches AC shape
    const job = getJob(body.jobId);
    expect(job).toBeDefined();
    expect(job!.id).toBe(body.jobId);
    expect(job!.type).toBe("text-to-image");
    expect(job!.params).toEqual({ prompt: "a cat" });
    expect(job!.status).toBe("pending");
    expect(typeof job!.createdAt).toBe("string");
    expect(new Date(job!.createdAt).getTime()).toBeGreaterThan(0);
  });

  test("US-001-AC03: Response is 201 Created with body { jobId } only — no blocking", async () => {
    const res = await postJob({ type: "render", params: {} });
    expect(res.status).toBe(201);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(["jobId"]);
    expect(typeof body.jobId).toBe("string");
  });

  test("US-001-AC04: Empty body returns 400 with descriptive error", async () => {
    const res = await postJob({});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(typeof body.error).toBe("string");
    expect(body.error.length).toBeGreaterThan(0);
  });

  test("US-001-AC04: Missing params returns 400", async () => {
    const res = await postJob({ type: "text-to-image" });
    expect(res.status).toBe(400);
  });

  test("US-001-AC04: Missing type returns 400", async () => {
    const res = await postJob({ params: { prompt: "a cat" } });
    expect(res.status).toBe(400);
  });

  test("US-001-AC04: Wrong type for `type` field returns 400", async () => {
    const res = await postJob({ type: 42, params: {} });
    expect(res.status).toBe(400);
  });

  test("US-001-AC04: Non-object params returns 400", async () => {
    const res = await postJob({ type: "render", params: "not-an-object" });
    expect(res.status).toBe(400);
  });
});
