/**
 * Schema definition and runtime validation for models.config.json.
 *
 * This module is intentionally free of external dependencies so it can be
 * used anywhere in the gateway without introducing a circular import.
 */

export const ARCHITECTURES = [
  "bundled-checkpoint",
  "separate-unet-dual-clip-image-vae",
  "separate-unet-multi-vae",
] as const;

export type Architecture = (typeof ARCHITECTURES)[number];

const VALID_TYPES = new Set(["images", "video", "editing", "audio", "upscalers"]);
const VALID_ARCHITECTURES = new Set<string>(ARCHITECTURES);

/** A validated model entry matching the models.config.json schema. */
export interface ModelConfigEntry {
  id: string;
  name: string;
  type: string;
  modalities: string[];
  description: string;
  /** Flat list of component filenames / identifiers needed to load this model. */
  components: string[];
  /**
   * Architecture variant that determines how component files are wired together:
   * - `bundled-checkpoint`: single file bundles UNet + text encoder(s) + VAE.
   * - `separate-unet-dual-clip-image-vae`: separate UNet, CLIP-L, CLIP-G, and image VAE files.
   * - `separate-unet-multi-vae`: shared UNet with distinct image VAE and audio VAE files.
   */
  architecture: Architecture;
}

function validateEntry(raw: unknown, index: number): ModelConfigEntry {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`models[${index}] must be a JSON object`);
  }
  const e = raw as Record<string, unknown>;

  if (typeof e.id !== "string" || e.id.length === 0)
    throw new Error(`models[${index}].id must be a non-empty string`);

  if (typeof e.name !== "string" || e.name.length === 0)
    throw new Error(`models[${index}].name must be a non-empty string`);

  if (typeof e.type !== "string" || !VALID_TYPES.has(e.type))
    throw new Error(
      `models[${index}].type must be one of: images, video, editing, audio, upscalers`,
    );

  if (!Array.isArray(e.modalities) || !e.modalities.every((m) => typeof m === "string"))
    throw new Error(`models[${index}].modalities must be an array of strings`);

  if (typeof e.description !== "string")
    throw new Error(`models[${index}].description must be a string`);

  if (!Array.isArray(e.components) || !e.components.every((c) => typeof c === "string"))
    throw new Error(`models[${index}].components must be an array of strings`);

  if (typeof e.architecture !== "string" || !VALID_ARCHITECTURES.has(e.architecture))
    throw new Error(`models[${index}].architecture must be one of: ${ARCHITECTURES.join(", ")}`);

  return {
    id: e.id,
    name: e.name,
    type: e.type,
    modalities: e.modalities as string[],
    description: e.description,
    components: e.components as string[],
    architecture: e.architecture as Architecture,
  };
}

/**
 * Validate the raw parsed JSON from models.config.json.
 * Throws with a clear, human-readable message if the shape is invalid.
 */
export function validateModelsConfig(raw: unknown): { models: ModelConfigEntry[] } {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("models.config.json root must be a JSON object");
  }
  const file = raw as Record<string, unknown>;
  if (!Array.isArray(file.models)) {
    throw new Error('models.config.json must contain a "models" array at the root');
  }
  const models = file.models.map((entry, i) => validateEntry(entry, i));
  return { models };
}
