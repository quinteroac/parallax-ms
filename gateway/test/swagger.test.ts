import { describe, expect, test } from "bun:test";
import { app } from "../src/index";

describe("US-003 OpenAPI spec and Swagger UI at /swagger", () => {
  test("US-003-AC01: GET /swagger returns HTTP 200 with HTML Swagger UI page", async () => {
    const res = await app.handle(new Request("http://localhost/swagger"));
    expect(res.status).toBe(200);
    const contentType = res.headers.get("content-type") ?? "";
    expect(contentType).toContain("text/html");
    const body = await res.text();
    expect(body.toLowerCase()).toContain("swagger");
  });

  test("US-003-AC02: GET /swagger/json returns HTTP 200 with valid OpenAPI 3.x JSON document", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    expect(res.status).toBe(200);
    const spec = (await res.json()) as {
      openapi: string;
      paths: Record<string, unknown>;
    };
    expect(spec.openapi).toMatch(/^3\./);
    expect(typeof spec.paths).toBe("object");
  });

  test("US-003-AC03: spec includes all required /v1/... routes", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as { paths: Record<string, unknown> };
    const paths = Object.keys(spec.paths);

    expect(paths).toContain("/v1/models");
    expect(paths).toContain("/v1/models/{id}");
    expect(paths).toContain("/v1/jobs");
    expect(paths).toContain("/v1/jobs/{id}");
    expect(paths).toContain("/v1/jobs/{id}/events");
  });

  test("US-003-AC04: each /v1 route has a non-empty summary", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as {
      paths: Record<string, Record<string, { summary?: string }>>;
    };

    const v1Paths = Object.entries(spec.paths).filter(([path]) => path.startsWith("/v1"));
    expect(v1Paths.length).toBeGreaterThan(0);

    for (const [path, methods] of v1Paths) {
      for (const [method, operation] of Object.entries(methods)) {
        expect(
          (operation as { summary?: string }).summary,
          `${method.toUpperCase()} ${path} is missing a summary`,
        ).toBeTruthy();
      }
    }
  });

  test("US-003-AC05: swagger is served by the existing Elysia app (no separate process)", async () => {
    // Verified implicitly: both /swagger and /swagger/json are handled by the
    // same `app` instance exported from index.ts with no additional setup.
    const uiRes = await app.handle(new Request("http://localhost/swagger"));
    const jsonRes = await app.handle(new Request("http://localhost/swagger/json"));
    expect(uiRes.status).toBe(200);
    expect(jsonRes.status).toBe(200);
  });
});
