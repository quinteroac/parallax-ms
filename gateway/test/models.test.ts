import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { app } from "../src/index";
import type { ModelEntry } from "../src/model-store";
import { createModelsRoutes } from "../src/routes/models";

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
      expect(typeof m.components).toBe("object");
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
          components: { unet: "unet.safetensors" },
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

const imageModel: ModelEntry = {
  id: "sdxl",
  name: "SDXL",
  type: "images",
  modalities: ["text-to-image"],
  description: "test",
  components: { unet: "unet.safetensors" },
};

describe("US-002 GET /v1/models?type=", () => {
  // AC01: returns 200 with { images: [...] } containing only image models
  test("AC01: ?type=images returns 200 with { images: [...] } and no other keys", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models?type=images"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.images)).toBe(true);
    expect("video" in body).toBe(false);
    expect("editing" in body).toBe(false);
    expect("audio" in body).toBe(false);
    expect("upscalers" in body).toBe(false);
  });

  // AC01: models in the filtered response belong to the requested type
  test("AC01: models returned under the type key all have type === images", async () => {
    const routes = createModelsRoutes(() => ({
      images: [imageModel],
      video: [],
      editing: [],
      audio: [],
      upscalers: [],
    }));
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models?type=images"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { images: ModelEntry[] };
    expect(body.images).toHaveLength(1);
    expect(body.images[0].id).toBe("sdxl");
  });

  // AC02: valid type values are case-insensitive
  test("AC02: type parameter is case-insensitive (IMAGES → images)", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models?type=IMAGES"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.images)).toBe(true);
  });

  test("AC02: mixed case type (Video) is accepted", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models?type=Video"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(Array.isArray(body.video)).toBe(true);
  });

  // AC03: unknown type returns 400 with the prescribed error message
  test("AC03: unknown type value returns 400", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models?type=unknown"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Invalid type. Valid values: images, video, editing, audio, upscalers");
  });

  test("AC03: empty string type returns 400", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models?type="));
    expect(res.status).toBe(400);
  });

  // AC04: valid type with no configured models returns { <type>: [] }
  test("AC04: valid type with no models returns { <type>: [] }", async () => {
    const routes = createModelsRoutes(() => ({
      images: [],
      video: [],
      editing: [],
      audio: [],
      upscalers: [],
    }));
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models?type=audio"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.audio).toEqual([]);
    expect("images" in body).toBe(false);
  });
});

const fullModel: ModelEntry = {
  id: "sdxl-full",
  name: "SDXL Full",
  type: "images",
  modalities: ["text-to-image"],
  description: "Full SDXL model",
  components: {
    unet: "unet.safetensors",
    checkpoint: "checkpoint.safetensors",
    clip: "clip.safetensors",
    text_encoder: "te.safetensors",
    vae: { image: "vae_image.safetensors", audio: "vae_audio.safetensors" },
  },
};

describe("US-003 GET /v1/models/:id", () => {
  // AC01: returns 200 with the full model object when ID exists
  test("AC01: returns HTTP 200 with full model object for a known ID", async () => {
    const routes = createModelsRoutes(() => ({
      images: [fullModel],
      video: [],
      editing: [],
      audio: [],
      upscalers: [],
    }));
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models/sdxl-full"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ModelEntry;
    expect(body.id).toBe("sdxl-full");
    expect(body.name).toBe("SDXL Full");
    expect(body.type).toBe("images");
    expect(body.modalities).toEqual(["text-to-image"]);
    expect(body.description).toBe("Full SDXL model");
    expect(body.components).toEqual({
      unet: "unet.safetensors",
      checkpoint: "checkpoint.safetensors",
      clip: "clip.safetensors",
      text_encoder: "te.safetensors",
      vae: { image: "vae_image.safetensors", audio: "vae_audio.safetensors" },
    });
  });

  // AC01: works for a model that exists in the real config
  test("AC01: returns a real model from the default config", async () => {
    const res = await app.handle(
      new Request("http://localhost/v1/models/stable-diffusion-xl-base"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as ModelEntry;
    expect(body.id).toBe("stable-diffusion-xl-base");
    expect(typeof body.components).toBe("object");
    expect(Object.keys(body.components as Record<string, unknown>).length).toBeGreaterThan(0);
  });

  // AC02: returns 404 with { error: "Model not found" } when ID does not exist
  test("AC02: returns HTTP 404 with error message for unknown ID", async () => {
    const routes = createModelsRoutes(() => ({
      images: [fullModel],
      video: [],
      editing: [],
      audio: [],
      upscalers: [],
    }));
    const testApp = new Elysia().use(routes);
    const res = await testApp.handle(new Request("http://localhost/v1/models/nonexistent-model"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Model not found");
  });

  // AC02: 404 also via the real app for an unknown ID
  test("AC02: real app returns 404 for an unknown model ID", async () => {
    const res = await app.handle(new Request("http://localhost/v1/models/this-does-not-exist"));
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Model not found");
  });
});
