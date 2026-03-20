import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");
const gatewayRoot = join(import.meta.dir, "..");

describe("US-005 README stack table reflected in dependencies", () => {
  test("US-005-AC01: gateway package.json declares Elysia, p-queue, and dotenvx per README Phase 1 row", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "gateway/package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies.elysia).toBeDefined();
    expect(pkg.dependencies["p-queue"]).toBeDefined();
    expect(pkg.dependencies["@dotenvx/dotenvx"]).toBeDefined();

    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/gateway\/package\.json/i);
    expect(readme.toLowerCase()).toContain("elysia");
    expect(readme.toLowerCase()).toContain("p-queue");
    expect(readme.toLowerCase()).toContain("dotenvx");

    expect(readme.toLowerCase()).toContain("not a phase 1 package dependency");
  });

  test("US-005-AC02: worker pyproject.toml declares FastAPI, Uvicorn, and Pydantic per README worker row", () => {
    const pyproject = readFileSync(join(repoRoot, "worker/pyproject.toml"), "utf8");
    expect(pyproject.toLowerCase()).toContain("fastapi");
    expect(pyproject.toLowerCase()).toContain("uvicorn");
    expect(pyproject.toLowerCase()).toContain("pydantic");

    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/worker\/pyproject\.toml/i);
    expect(readme.toLowerCase()).toContain("fastapi");
    expect(readme.toLowerCase()).toContain("uvicorn");
    expect(readme.toLowerCase()).toContain("pydantic");
  });

  test("US-005-AC03: README distinguishes Phase 1 manifest deps from Portless and comfy-diffusion (no silent mismatch)", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    const lower = readme.toLowerCase();
    expect(lower).toContain("portless");
    expect(lower).toContain("not a phase 1 package dependency");
    expect(lower).toContain("comfy-diffusion");
    expect(lower).toContain("not in the phase 1 worker manifest");
  });

  test("US-005-AC04: gateway typecheck and lint succeed", async () => {
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
