import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");

describe("US-001 Monorepo layout and documented install/run", () => {
  test("US-001-AC01: monorepo separates gateway (Node) and worker (Python)", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "gateway/package.json"), "utf8")) as {
      name: string;
    };
    expect(pkg.name).toBe("parallax-gateway");
    const py = readFileSync(join(repoRoot, "worker/pyproject.toml"), "utf8");
    expect(py).toContain("parallax-worker");
    expect(py).toContain("fastapi");
  });

  test("US-001-AC02: README documents Bun for gateway and uv for worker install", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme.toLowerCase()).toMatch(/bun install/);
    expect(readme.toLowerCase()).toMatch(/uv sync/);
  });

  test("US-001-AC03: README documents run commands and references env templates", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/bun run dev/i);
    expect(readme).toMatch(/uvicorn/i);
    expect(readme).toMatch(/\.env\.example/);
  });

  test("US-001-AC04: gateway tooling defines typecheck and lint entry points", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "gateway/package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toContain("tsc");
    expect(pkg.scripts.lint).toContain("eslint");
    expect(pkg.scripts.lint).toContain("prettier");
  });
});
