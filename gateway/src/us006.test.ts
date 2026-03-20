import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "./index";
import { clearJobs, createJob, getJob } from "./job-store";
import { clearListeners, subscribe } from "./sse-emitter";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

describe("US-006 Gateway receives completion callback and emits SSE", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
  });

  // ---------- AC01 ----------

  test("US-006-AC01: POST /worker/done accepts { id, url }", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const res = await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: "https://example.com/result.png" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
  });

  // ---------- AC02 ----------

  test("US-006-AC02: gateway updates job status to succeeded, sets url, refreshes updatedAt", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });
    const originalUpdatedAt = job.updatedAt;

    // Ensure time advances so updatedAt is different
    await Bun.sleep(1);

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: "https://example.com/result.png" }),
      }),
    );

    const updated = getJob(job.id)!;
    expect(updated.status).toBe("succeeded");
    expect(updated.url).toBe("https://example.com/result.png");
    expect(updated.updatedAt).not.toBe(originalUpdatedAt);
  });

  // ---------- AC03 ----------

  test("US-006-AC03: gateway emits SSE event to open subscriber for the job", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    // Subscribe via SSE endpoint before posting done
    const sseRes = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}/events`));

    // Post completion
    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: "https://example.com/result.png" }),
      }),
    );

    const text = await sseRes.text();
    const dataLine = text.split("\n").find((l) => l.startsWith("data:"));
    expect(dataLine).toBeDefined();
    const payload = JSON.parse(dataLine!.slice("data: ".length)) as Record<string, unknown>;
    expect(payload.id).toBe(job.id);
    expect(payload.status).toBe("succeeded");
    expect(payload.url).toBe("https://example.com/result.png");
  });

  test("US-006-AC03: SSE event emitted to programmatic subscriber", async () => {
    const job = createJob("text-to-image", { prompt: "a cat" });

    let received: Record<string, unknown> | undefined;
    subscribe(job.id, (evt) => {
      received = evt as unknown as Record<string, unknown>;
    });

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: "https://cdn.example.com/img.png" }),
      }),
    );

    expect(received).toBeDefined();
    expect(received!.id).toBe(job.id);
    expect(received!.status).toBe("succeeded");
    expect(received!.url).toBe("https://cdn.example.com/img.png");
  });

  // ---------- AC04 ----------

  test("US-006-AC04: unknown id returns 404 and does not mutate state", async () => {
    const unknownId = "00000000-0000-4000-8000-000000000000";
    const res = await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: unknownId, url: "https://example.com/result.png" }),
      }),
    );
    expect(res.status).toBe(404);
    expect(getJob(unknownId)).toBeUndefined();
  });

  // ---------- AC05 ----------

  test("US-006-AC05: typecheck and lint pass", () => {
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
