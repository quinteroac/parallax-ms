import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Architecture, validateModelsConfig } from "./model-config-schema";

export interface ModelEntry {
  id: string;
  name: string;
  type: string;
  modalities: string[];
  description: string;
  components: string[];
  /** Architecture variant; present for entries loaded from models.config.json. */
  architecture?: Architecture;
}

export const MODEL_TYPES = ["images", "video", "editing", "audio", "upscalers"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];
export type ModelsResponse = Record<ModelType, ModelEntry[]>;

/** Resolve the config path: MODELS_CONFIG_PATH env var → project root default. */
function getConfigPath(): string {
  return process.env.MODELS_CONFIG_PATH ?? join(import.meta.dir, "../../models.config.json");
}

/** Parse, validate, and group models by type. Throws if the config is unreadable or invalid. */
export function loadModels(configPath?: string): ModelsResponse {
  const resolvedPath = configPath ?? getConfigPath();

  let raw: string;
  try {
    raw = readFileSync(resolvedPath, "utf-8");
  } catch {
    throw new Error("Model configuration unavailable");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model configuration unavailable");
  }

  let validated: ReturnType<typeof validateModelsConfig>;
  try {
    validated = validateModelsConfig(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Model configuration invalid: ${message}`);
  }

  const result: ModelsResponse = {
    images: [],
    video: [],
    editing: [],
    audio: [],
    upscalers: [],
  };

  for (const model of validated.models) {
    if (model.type in result) {
      result[model.type as ModelType].push(model);
    }
  }

  return result;
}

/** Find a single model by ID across all types. Returns undefined if not found. */
export function findModelById(models: ModelsResponse, id: string): ModelEntry | undefined {
  for (const type of MODEL_TYPES) {
    const found = models[type].find((m) => m.id === id);
    if (found) return found;
  }
  return undefined;
}
