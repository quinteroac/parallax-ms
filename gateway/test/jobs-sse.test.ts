import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "../src/index";
import { clearJobs, createJob, updateJob } from "../src/job-store";
import { clearListeners } from "../src/sse-emitter";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

describe("US-004 SSE channel per job", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
  });

  // ---------- AC01 ----------

  test("US-004-AC01: GET /v1/jobs/:id/events responds with Content-Type text/event-stream", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    updateJob(job.id, { status: "succeeded", url: "https://example.com/result.png" });
    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
  });

  // ---------- AC02 ----------

  test("US-004-AC02: succeeded job event carries id, status, url", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));

    updateJob(job.id, { status: "succeeded", url: "https://example.com/result.png" });

    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.id).toBe(job.id);
    expect(payload.status).toBe("succeeded");
    expect(payload.url).toBe("https://example.com/result.png");
    expect(payload.error).toBeUndefined();
  });

  test("US-004-AC02: failed job event carries id, status, error", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));

    updateJob(job.id, { status: "failed", error: "Worker unreachable" });

    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.id).toBe(job.id);
    expect(payload.status).toBe("failed");
    expect(payload.error).toBe("Worker unreachable");
    expect(payload.url).toBeUndefined();
  });

  // ---------- AC03 ----------

  test("US-004-AC03: stream closes after terminal event (text() resolves)", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));

    updateJob(job.id, { status: "succeeded", url: "https://example.com/result.png" });

    // If stream never closes, this would hang — the test would timeout.
    const text = await res.text();
    expect(text).toContain("data:");
  });

  // ---------- AC04 ----------

  test("US-004-AC04: already-succeeded job emits terminal event immediately", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    updateJob(job.id, { status: "succeeded", url: "https://example.com/result.png" });

    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));
    expect(res.status).toBe(200);
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.status).toBe("succeeded");
  });

  test("US-004-AC04: already-failed job emits terminal event immediately", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    updateJob(job.id, { status: "failed", error: "timeout" });

    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));
    expect(res.status).toBe(200);
    const text = await res.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.status).toBe("failed");
  });

  // ---------- AC05 ----------

  test("US-004-AC05: unknown job id returns 404", async () => {
    const res = await app.handle(
      new Request(`${BASE}/v1/jobs/00000000-0000-4000-8000-000000000000/events`),
    );
    expect(res.status).toBe(404);
  });

  // ---------- AC06 ----------

  test("US-004-AC06: typecheck and lint pass", () => {
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
