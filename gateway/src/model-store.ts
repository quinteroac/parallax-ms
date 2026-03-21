import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface ModelEntry {
  id: string;
  name: string;
  type: string;
  modalities: string[];
  description: string;
  components: string[];
}

export const MODEL_TYPES = ["images", "video", "editing", "audio", "upscalers"] as const;
export type ModelType = (typeof MODEL_TYPES)[number];
export type ModelsResponse = Record<ModelType, ModelEntry[]>;

const CONFIG_PATH = join(import.meta.dir, "models.config.json");

/** Parse and group models by type. Throws if the config is unreadable or invalid. */
export function loadModels(configPath: string = CONFIG_PATH): ModelsResponse {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    throw new Error("Model configuration unavailable");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model configuration unavailable");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as Record<string, unknown>).models)
  ) {
    throw new Error("Model configuration unavailable");
  }

  const result: ModelsResponse = {
    images: [],
    video: [],
    editing: [],
    audio: [],
    upscalers: [],
  };

  for (const model of (parsed as { models: unknown[] }).models) {
    const entry = model as ModelEntry;
    if (entry.type in result) {
      result[entry.type as ModelType].push(entry);
    }
  }

  return result;
}
