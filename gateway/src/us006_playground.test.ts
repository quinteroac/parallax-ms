import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "./index";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

describe("US-006 Basic playground page for manual testing", () => {
  // ---------- AC01 ----------

  test("US-006-AC01: GET /playground returns 200 with text/html content type", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  // ---------- AC02 ----------

  test("US-006-AC02: page contains Prompt text input", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="prompt"');
    expect(body).toContain('type="text"');
  });

  test("US-006-AC02: page contains Negative prompt text input (optional)", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="negative_prompt"');
  });

  test("US-006-AC02: page contains Steps number input with default 20", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="steps"');
    expect(body).toContain('type="number"');
    expect(body).toMatch(/id="steps"[^>]*value="20"|value="20"[^>]*id="steps"/);
  });

  test("US-006-AC02: page contains Seed number input with default 0", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="seed"');
    expect(body).toMatch(/id="seed"[^>]*value="0"|value="0"[^>]*id="seed"/);
  });

  // ---------- AC03 ----------

  test("US-006-AC03: page contains a submit button", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('type="submit"');
  });

  test("US-006-AC03: page includes script that calls /v1/jobs on submit", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("/v1/jobs");
    expect(body).toContain("EventSource");
    expect(body).toContain("jobId");
  });

  test("US-006-AC03: page includes loading indicator element", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="loading"');
  });

  // ---------- AC04 ----------

  test("US-006-AC04: page includes an image element to display result", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="result"');
    expect(body).toContain("<img");
  });

  test("US-006-AC04: script handles succeeded SSE event and sets image src", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("succeeded");
    expect(body).toContain("payload.url");
    expect(body).toContain("showResult");
  });

  // ---------- AC05 ----------

  test("US-006-AC05: page includes an error display element", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="error"');
  });

  test("US-006-AC05: script handles failed SSE event and shows error", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("failed");
    expect(body).toContain("showError");
  });

  test("US-006-AC05: script handles EventSource onerror", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("onerror");
  });

  // ---------- AC07 ----------

  test("US-006-AC07: typecheck passes", () => {
    const result = Bun.spawnSync(["bun", "run", "typecheck"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("US-006-AC07: lint passes", () => {
    const result = Bun.spawnSync(["bun", "run", "lint"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });
});
