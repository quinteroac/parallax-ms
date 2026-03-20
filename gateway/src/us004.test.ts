import { beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "./index";
import { clearJobs, createJob } from "./job-store";
import { clearListeners } from "./sse-emitter";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

describe("US-004 Generated image URL included in job state and callback", () => {
  beforeEach(() => {
    clearJobs();
    clearListeners();
  });

  // ---------- AC03 ----------

  test("US-004-AC03: GET /v1/jobs/:id returns status=succeeded and url after callback", async () => {
    const job = createJob("text-to-image", { prompt: "a dog" });
    const imageUrl = "http://localhost:8000/assets/" + job.id + ".png";

    // Simulate worker callback
    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: imageUrl }),
      }),
    );

    // Poll job state
    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("succeeded");
    expect(body.url).toBe(imageUrl);
  });

  test("US-004-AC03: url field absent before callback is received", async () => {
    const job = createJob("text-to-image", { prompt: "a horse" });

    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.status).toBe("pending");
    expect(body.url).toBeUndefined();
  });

  test("US-004-AC03: url reflects exact value posted by worker", async () => {
    const job = createJob("text-to-image", { prompt: "mountains" });
    const workerUrl = "http://worker.internal:8000/assets/" + job.id + ".png";

    await app.handle(
      new Request(`${BASE}/worker/done`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: job.id, url: workerUrl }),
      }),
    );

    const res = await app.handle(new Request(`${BASE}/v1/jobs/${job.id}`));
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.url).toBe(workerUrl);
  });

  // ---------- AC05 ----------

  test("US-004-AC05: typecheck and lint pass", () => {
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
