import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { clearJobs, createJob, getJob } from "./job-store";
import { enqueueJob, queue } from "./queue";

const gatewayRoot = join(import.meta.dir, "..");

// Save original fetch so it can be restored after each test.
const originalFetch = global.fetch;

describe("US-002 Queue forwards job to the stub worker", () => {
  beforeEach(() => {
    clearJobs();
    queue.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // ---------- AC01 ----------

  test("US-002-AC01: p-queue is configured with concurrency 1", () => {
    expect(queue.concurrency).toBe(1);
  });

  test("US-002-AC01: second job waits in queue while first is running", async () => {
    let resolveFirst!: () => void;
    const firstGate = new Promise<void>((r) => {
      resolveFirst = r;
    });

    global.fetch = mock(async () => {
      await firstGate;
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const job1 = createJob("type-a", {});
    const job2 = createJob("type-b", {});
    enqueueJob(job1);
    enqueueJob(job2);

    // Give the event-loop a moment so the queue starts job1.
    await new Promise((r) => setTimeout(r, 10));

    // With concurrency 1: first job is pending, second is waiting.
    expect(queue.pending).toBe(1);
    expect(queue.size).toBe(1);

    resolveFirst();
    await queue.onIdle();
  });

  // ---------- AC02 ----------

  test("US-002-AC02: gateway POSTs { id, type, params } to worker /infer", async () => {
    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: unknown;

    global.fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedMethod = init?.method ?? "";
      capturedBody = JSON.parse(String(init?.body));
      return new Response(null, { status: 202 });
    }) as unknown as typeof fetch;

    const job = createJob("text-to-image", { prompt: "a cat" });
    enqueueJob(job);
    await queue.onIdle();

    expect(capturedUrl).toMatch(/\/infer$/);
    expect(capturedMethod).toBe("POST");
    expect(capturedBody).toEqual({ id: job.id, type: job.type, params: job.params });
  });

  // ---------- AC03 ----------

  test("US-002-AC03: on 202 from worker, job status becomes running", async () => {
    global.fetch = mock(async () => new Response(null, { status: 202 })) as unknown as typeof fetch;

    const job = createJob("text-to-image", { prompt: "a cat" });
    enqueueJob(job);
    await queue.onIdle();

    expect(getJob(job.id)!.status).toBe("running");
  });

  // ---------- AC04 ----------

  test("US-002-AC04: if worker is unreachable, job status is failed with error message", async () => {
    global.fetch = mock(async () => {
      throw new Error("ECONNREFUSED");
    }) as unknown as typeof fetch;

    const job = createJob("text-to-image", { prompt: "a cat" });
    enqueueJob(job);
    await queue.onIdle();

    const stored = getJob(job.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.error).toBeDefined();
    expect(stored.error!.length).toBeGreaterThan(0);
  });

  test("US-002-AC04: non-202 response from worker sets job to failed", async () => {
    global.fetch = mock(async () => new Response(null, { status: 500 })) as unknown as typeof fetch;

    const job = createJob("text-to-image", { prompt: "a cat" });
    enqueueJob(job);
    await queue.onIdle();

    const stored = getJob(job.id)!;
    expect(stored.status).toBe("failed");
    expect(stored.error).toBeDefined();
  });

  // ---------- AC05 ----------

  test("US-002-AC05: typecheck and lint pass", () => {
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
