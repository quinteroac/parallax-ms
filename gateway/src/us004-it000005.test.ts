import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "../..");
const gatewayRoot = join(import.meta.dir, "..");

const readme = readFileSync(join(repoRoot, "README.md"), "utf8");
const projectContext = readFileSync(join(repoRoot, ".agents/PROJECT_CONTEXT.md"), "utf8");

describe("US-004 (it000005) README and AGENTS.md reflect the locked public contract", () => {
  // ---------- AC01: README API reference section ----------

  test("AC01: README contains an API reference section", () => {
    expect(readme).toMatch(/## API reference/i);
  });

  test("AC01: README documents POST /v1/jobs with request body and response", () => {
    expect(readme).toContain("POST /v1/jobs");
    expect(readme).toContain("modelId");
    expect(readme).toContain("modality");
    expect(readme).toContain("params");
    expect(readme).toContain("201");
    expect(readme).toContain("jobId");
  });

  test("AC01: README documents GET /v1/jobs/:id with response shape", () => {
    expect(readme).toContain("GET /v1/jobs/:id");
    expect(readme).toContain("createdAt");
    expect(readme).toContain("updatedAt");
    expect(readme).toContain("400");
    expect(readme).toContain("404");
  });

  test("AC01: README documents GET /v1/jobs/:id/events with SSE format", () => {
    expect(readme).toContain("GET /v1/jobs/:id/events");
    expect(readme).toContain("text/event-stream");
  });

  test("AC01: README documents GET /v1/models", () => {
    expect(readme).toContain("GET /v1/models");
  });

  test("AC01: README documents GET /v1/models/:id", () => {
    expect(readme).toContain("GET /v1/models/:id");
  });

  test("AC01: README documents GET /swagger", () => {
    expect(readme).toContain("GET /swagger");
  });

  // ---------- AC02: four job statuses and conditional fields ----------

  test("AC02: README documents all four job statuses", () => {
    expect(readme).toContain("`pending`");
    expect(readme).toContain("`running`");
    expect(readme).toContain("`succeeded`");
    expect(readme).toContain("`failed`");
  });

  test("AC02: README documents when url field is present (succeeded status)", () => {
    // The status table should relate url to succeeded
    const statusTableIdx = readme.indexOf("Job statuses");
    expect(statusTableIdx).toBeGreaterThan(-1);
    const tableSection = readme.slice(statusTableIdx, statusTableIdx + 1000);
    expect(tableSection).toContain("succeeded");
    expect(tableSection.toLowerCase()).toContain("url");
  });

  test("AC02: README documents when error field is present (failed status)", () => {
    const statusTableIdx = readme.indexOf("Job statuses");
    const tableSection = readme.slice(statusTableIdx, statusTableIdx + 1000);
    expect(tableSection).toContain("failed");
    expect(tableSection.toLowerCase()).toContain("error");
  });

  // ---------- AC03: PROJECT_CONTEXT.md reflects iteration 000005 ----------

  test("AC03: PROJECT_CONTEXT.md Implemented Capabilities includes iteration 000005", () => {
    expect(projectContext).toContain("000005");
  });

  test("AC03: PROJECT_CONTEXT.md mentions API reference or README documentation for iteration 000005", () => {
    const it5Idx = projectContext.indexOf("000005");
    expect(it5Idx).toBeGreaterThan(-1);
    const entry = projectContext.slice(it5Idx, it5Idx + 500);
    expect(entry.toLowerCase()).toMatch(/readme|api reference|documentation/);
  });

  // ---------- AC04: typecheck and lint pass (no contradictions in code) ----------

  test("AC04: gateway typecheck passes", () => {
    const result = Bun.spawnSync(["bun", "run", "typecheck"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("AC04: gateway lint passes", () => {
    const result = Bun.spawnSync(["bun", "run", "lint"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("AC04: README POST /v1/jobs error codes match implementation (400, 422, 503)", () => {
    const postSection = readme.slice(
      readme.indexOf("POST /v1/jobs"),
      readme.indexOf("GET /v1/jobs/:id"),
    );
    expect(postSection).toContain("400");
    expect(postSection).toContain("422");
    expect(postSection).toContain("503");
  });

  test("AC04: README GET /v1/jobs/:id documents 404 response matching implementation", () => {
    // The GET /v1/jobs/:id heading appears in the markdown as `### \`GET /v1/jobs/:id\``
    const sectionStart = readme.indexOf("### `GET /v1/jobs/:id`");
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = readme.indexOf("### `GET /v1/jobs/:id/events`");
    const getSection = readme.slice(sectionStart, sectionEnd);
    expect(getSection).toContain("404");
  });
});
