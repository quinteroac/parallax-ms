import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { app } from "./index";
import { createModelsRoutes } from "./routes/models";

describe("US-001 GET /v1/models", () => {
  // AC01: returns 200 with all five category keys as arrays
  test("AC01: returns HTTP 200 with grouped model structure", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.images)).toBe(true);
    expect(Array.isArray(body.video)).toBe(true);
    expect(Array.isArray(body.editing)).toBe(true);
    expect(Array.isArray(body.audio)).toBe(true);
    expect(Array.isArray(body.upscalers)).toBe(true);
  });

  // AC02: each model entry contains all required fields
  test("AC02: each entry has id, name, type, modalities, description, components", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models"));
    const body = (await res.json()) as Record<string, unknown[]>;
    const allModels = [
      ...body.images,
      ...body.video,
      ...body.editing,
      ...body.audio,
      ...body.upscalers,
    ];
    expect(allModels.length).toBeGreaterThan(0);
    for (const model of allModels) {
      const m = model as Record<string, unknown>;
      expect(typeof m.id).toBe("string");
      expect(typeof m.name).toBe("string");
      expect(typeof m.type).toBe("string");
      expect(Array.isArray(m.modalities)).toBe(true);
      expect(typeof m.description).toBe("string");
      expect(Array.isArray(m.components)).toBe(true);
    }
  });

  // AC03: types with no configured models return [] rather than missing keys
  test("AC03: types with no models return empty array, not a missing key", async () => {
    const routes = createModelsRoutes(() => ({
      images: [
        {
          id: "m1",
          name: "M1",
          type: "images",
          modalities: ["text-to-image"],
          description: "test",
          components: ["unet"],
        },
      ],
      video: [],
      editing: [],
      audio: [],
      upscalers: [],
    }));
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    // All five keys must be present even if empty
    expect("video" in body).toBe(true);
    expect("editing" in body).toBe(true);
    expect("audio" in body).toBe(true);
    expect("upscalers" in body).toBe(true);
    expect(body.video).toEqual([]);
    expect(body.editing).toEqual([]);
    expect(body.audio).toEqual([]);
    expect(body.upscalers).toEqual([]);
  });

  // AC04: missing / unparseable config → 503
  test("AC04: returns 503 when model config is unavailable", async () => {
    const routes = createModelsRoutes(() => {
      throw new Error("simulated missing config");
    });
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models"));
    expect(res.status).toBe(503);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Model configuration unavailable");
  });
});
