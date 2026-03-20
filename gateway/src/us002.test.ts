import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");

/** Substrings that must not appear in committed example env files (real-secret shapes). */
const SECRET_DENYLIST = [
  "sk-ant-",
  "sk_live_",
  "sk-proj-",
  "ghp_",
  "gho_",
  "github_pat_",
  "xoxb-",
  "xoxp-",
  "AIza",
  "AKIA",
];

describe("US-002 Local secrets and example environment templates", () => {
  test("US-002-AC01: gateway uses dotenvx and README documents rationale", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "gateway/package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(pkg.dependencies["@dotenvx/dotenvx"]).toBeDefined();

    const index = readFileSync(join(repoRoot, "gateway/src/index.ts"), "utf8");
    expect(index).toContain("@dotenvx/dotenvx");
    expect(index).toContain("config(");

    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme.toLowerCase()).toContain("dotenvx");
    expect(readme).toMatch(/replace|ad-hoc|shell/i);
    expect(readme).toMatch(/@dotenvx\/dotenvx|config\(\)/i);
  });

  test("US-002-AC02: example env templates contain placeholders only (no secret-shaped values)", () => {
    for (const rel of ["gateway/.env.example", "worker/.env.example"]) {
      const text = readFileSync(join(repoRoot, rel), "utf8");
      const lower = text.toLowerCase();
      for (const bad of SECRET_DENYLIST) {
        expect(lower).not.toContain(bad.toLowerCase());
      }
    }
  });

  test("US-002-AC03: README distinguishes Phase 1 required vs optional vs later-phase variables", () => {
    const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
    expect(readme).toMatch(/phase\s*1/i);
    expect(readme.toLowerCase()).toContain("required");
    expect(readme.toLowerCase()).toContain("optional");
    expect(readme.toLowerCase()).toContain("later phase");
    expect(readme.toLowerCase()).toContain("gateway");
    expect(readme.toLowerCase()).toContain("worker");
  });

  test("US-002-AC04: gateway typecheck and lint scripts remain defined", () => {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "gateway/package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts.typecheck).toContain("tsc");
    expect(pkg.scripts.lint).toContain("eslint");
    expect(pkg.scripts.lint).toContain("prettier");
  });
});
