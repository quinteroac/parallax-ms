import { beforeEach, describe, expect, test } from "bun:test";
import { app } from "./index";
import { clearJobs, createJob, updateJob } from "./job-store";

const BASE = "http://localhost";

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
