import { describe, expect, test } from "bun:test";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ARCHITECTURES, validateModelsConfig } from "./model-config-schema";
import { loadModels } from "./model-store";

const projectRoot = join(import.meta.dir, "../..");
const gatewayRoot = join(import.meta.dir, "..");

describe("US-004 models.config.json schema and file placement", () => {
  // ---------- AC01 ----------

  test("AC01: models.config.json exists at the project root", () => {
    const configPath = join(projectRoot, "models.config.json");
    expect(() => readFileSync(configPath, "utf-8")).not.toThrow();
  });

  test("AC01: loadModels() loads from project root by default (no explicit path)", () => {
    // MODELS_CONFIG_PATH is not set; should resolve to project root
    const original = process.env.MODELS_CONFIG_PATH;
    delete process.env.MODELS_CONFIG_PATH;
    try {
      const models = loadModels();
      expect(typeof models).toBe("object");
      // At least one category must be non-empty
      const total = Object.values(models).reduce((n, arr) => n + arr.length, 0);
      expect(total).toBeGreaterThan(0);
    } finally {
      if (original !== undefined) process.env.MODELS_CONFIG_PATH = original;
    }
  });

  test("AC01: MODELS_CONFIG_PATH env var overrides default config location", () => {
    const original = process.env.MODELS_CONFIG_PATH;
    process.env.MODELS_CONFIG_PATH = join(projectRoot, "models.config.json");
    try {
      const models = loadModels();
      expect(typeof models).toBe("object");
    } finally {
      if (original === undefined) delete process.env.MODELS_CONFIG_PATH;
      else process.env.MODELS_CONFIG_PATH = original;
    }
  });

  // ---------- AC02 ----------

  test("AC02: config contains at least one bundled-checkpoint entry", () => {
    const all = Object.values(loadModels()).flat();
    const found = all.find((m) => m.architecture === "bundled-checkpoint");
    expect(found).toBeDefined();
  });

  test("AC02: config contains at least one separate-unet-dual-clip-image-vae entry", () => {
    const all = Object.values(loadModels()).flat();
    const found = all.find((m) => m.architecture === "separate-unet-dual-clip-image-vae");
    expect(found).toBeDefined();
  });

  test("AC02: config contains at least one separate-unet-multi-vae entry", () => {
    const all = Object.values(loadModels()).flat();
    const found = all.find((m) => m.architecture === "separate-unet-multi-vae");
    expect(found).toBeDefined();
  });

  // ---------- AC03 ----------

  test("AC03: validateModelsConfig accepts a valid config with all required fields", () => {
    const valid = {
      models: [
        {
          id: "test-model",
          name: "Test Model",
          type: "images",
          modalities: ["text-to-image"],
          description: "A test model.",
          components: { checkpoint: "model.safetensors" },
          architecture: "bundled-checkpoint",
        },
      ],
    };
    expect(() => validateModelsConfig(valid)).not.toThrow();
    const result = validateModelsConfig(valid);
    expect(result.models).toHaveLength(1);
    expect(result.models[0].architecture).toBe("bundled-checkpoint");
  });

  test("AC03: schema rejects entry with missing architecture field", () => {
    const invalid = {
      models: [
        {
          id: "no-arch",
          name: "No Architecture",
          type: "images",
          modalities: ["text-to-image"],
          description: "Missing architecture.",
          components: { checkpoint: "model.safetensors" },
          // architecture omitted
        },
      ],
    };
    expect(() => validateModelsConfig(invalid)).toThrow(/architecture/);
  });

  test("AC03: schema rejects entry with invalid architecture value", () => {
    const invalid = {
      models: [
        {
          id: "bad-arch",
          name: "Bad Architecture",
          type: "images",
          modalities: ["text-to-image"],
          description: "Invalid architecture.",
          components: { checkpoint: "model.safetensors" },
          architecture: "unknown-architecture",
        },
      ],
    };
    expect(() => validateModelsConfig(invalid)).toThrow(/architecture/);
  });

  test("AC03: schema rejects entry with invalid type value", () => {
    const invalid = {
      models: [
        {
          id: "bad-type",
          name: "Bad Type",
          type: "not-a-valid-type",
          modalities: ["text-to-image"],
          description: "Invalid type.",
          components: { checkpoint: "model.safetensors" },
          architecture: "bundled-checkpoint",
        },
      ],
    };
    expect(() => validateModelsConfig(invalid)).toThrow(/type/);
  });

  test("AC03: schema rejects entry with missing id", () => {
    const invalid = {
      models: [
        {
          name: "No ID",
          type: "images",
          modalities: ["text-to-image"],
          description: "Missing id.",
          components: { checkpoint: "model.safetensors" },
          architecture: "bundled-checkpoint",
        },
      ],
    };
    expect(() => validateModelsConfig(invalid)).toThrow(/id/);
  });

  test("AC03: schema rejects non-array root (clear error message)", () => {
    expect(() => validateModelsConfig(["not", "an", "object"])).toThrow(
      /root must be a JSON object/,
    );
  });

  test("AC03: schema rejects config without models array (clear error message)", () => {
    expect(() => validateModelsConfig({ data: [] })).toThrow(/models/);
  });

  test("AC03: loadModels throws with clear message when file contains invalid schema", () => {
    const tmpPath = join(import.meta.dir, "__invalid_test_config__.json");
    writeFileSync(tmpPath, JSON.stringify({ models: [{ id: "" }] }));
    try {
      expect(() => loadModels(tmpPath)).toThrow(/Model configuration invalid/);
    } finally {
      unlinkSync(tmpPath);
    }
  });

  // ---------- AC04 ----------

  test("AC04: models.config.example.json exists at project root", () => {
    const examplePath = join(projectRoot, "models.config.example.json");
    expect(() => readFileSync(examplePath, "utf-8")).not.toThrow();
  });

  test("AC04: example file is valid JSON", () => {
    const examplePath = join(projectRoot, "models.config.example.json");
    const raw = readFileSync(examplePath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  test("AC04: ARCHITECTURES covers all three documented variants", () => {
    expect(ARCHITECTURES).toContain("bundled-checkpoint");
    expect(ARCHITECTURES).toContain("separate-unet-dual-clip-image-vae");
    expect(ARCHITECTURES).toContain("separate-unet-multi-vae");
  });

  // ---------- AC05 ----------

  test("AC05: typecheck and lint pass", () => {
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
