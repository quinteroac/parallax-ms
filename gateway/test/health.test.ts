import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "../src/index";

const gatewayRoot = join(import.meta.dir, "..");

describe("GET /health", () => {
  test("US-003-AC02: GET /health returns 200 with a minimal JSON body suitable for probes", async () => {
    const res = await app.handle(new Request("http://localhost/health"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
  });

  test("typecheck and lint pass", () => {
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
