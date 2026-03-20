import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "./index";
import { clearJobs, createJob, getJob } from "./job-store";
import { clearListeners, subscribe } from "./sse-emitter";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

describe("US-005 Worker errors propagate as failed job state", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
  });

  // ---------- AC02 ----------

  test("US-005-AC02: POST /worker/done with error updates job to failed", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    const res = await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, error: "CUDA out of memory" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);

    const updated = getJob(job.id)!;
    expect(updated.status).toBe("failed");
    expect(updated.error).toBe("CUDA out of memory");
  });

  test("US-005-AC02: gateway emits SSE event with status failed and error message", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    let received: Record<string, unknown> | undefined;
    subscribe(job.id, (evt) => {
      received = evt as unknown as Record<string, unknown>;
    });

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, error: "model load failed" }),
      }),
    );

    expect(received).toBeDefined();
    expect(received!.status).toBe("failed");
    expect(received!.error).toBe("model load failed");
  });

  test("US-005-AC02: SSE stream receives failed event with error", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    const sseRes = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, error: "GPU error" }),
      }),
    );

    const text = await sseRes.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.status).toBe("failed");
    expect(payload.error).toBe("GPU error");
  });

  // ---------- AC03 ----------

  test("US-005-AC03: GET /v1/jobs/:id returns failed status with error message", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, error: "inference error" }),
      }),
    );

    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("failed");
    expect(body.error).toBe("inference error");
  });

  // ---------- validation ----------

  test("US-005: POST /worker/done without url or error returns 400", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    const res = await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id }),
      }),
    );
    expect(res.status).toBe(400);
  });

  // ---------- AC05 ----------

  test("US-005-AC05: typecheck and lint pass", () => {
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
