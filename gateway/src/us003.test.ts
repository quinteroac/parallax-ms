import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "./index";

const repoRoot = join(import.meta.dir, "../..");
const gatewayRoot = join(import.meta.dir, "..");

describe("US-003 Gateway HTTP health or readiness", () => {
  test("US-003-AC01: README documents gateway start command and env template lists optional PORT", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme.toLowerCase()).toMatch(/cd gateway/);
    expect(readme.toLowerCase()).toMatch(/bun run dev/);
    expect(readme).toMatch(/gateway\/\.env\.example/);

    const envExample = readFileSync(join(repoRoot, "gateway/.env.example"), "utf8");
    expect(envExample.toUpperCase()).toContain("PORT");
  });

  test("US-003-AC02: GET /health returns 200 with a minimal JSON body suitable for probes", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
  });

  test("US-003-AC03: README documents health URL path and expected success status", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/\/health/);
    expect(readme).toMatch(/\bGET\b/i);
    expect(readme).toMatch(/200/);
  });

  test("US-003-AC04: gateway typecheck and lint succeed", async () => {
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
