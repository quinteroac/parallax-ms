/**
 * Schema definition and runtime validation for models.config.json.
 *
 * This module is intentionally free of external dependencies so it can be
 * used anywhere in the gateway without introducing a circular import.
 */

export const ARCHITECTURES = [
  "bundled-checkpoint",
  "separate-diffusion-model",
  "separate-unet-dual-clip-image-vae",
  "separate-unet-multi-vae",
  "ace-step-1.5",
] as const;

export type Architecture = (typeof ARCHITECTURES)[number];

const VALID_TYPES = new Set(["images", "video", "editing", "audio", "upscalers"]);
const VALID_ARCHITECTURES = new Set<string>(ARCHITECTURES);

/** Named-key components object describing the files that make up a model. */
export interface ModelComponents {
  /** Bundled checkpoint file (bundles UNet + text encoder(s) + VAE). */
  checkpoint?: string;
  /** Standalone diffusion model weights file (used with separate-diffusion-model architecture). */
  diffusion_model?: string;
  /** Standalone UNet weights file. */
  unet?: string;
  /** CLIP text encoder file, or an array of files (e.g. clip_l + clip_g for SDXL). */
  clip?: string | string[];
  /** Standalone text encoder file (used alongside a separate CLIP). */
  text_encoder?: string;
  /** VAE weights: either a single filename string or split by output modality. */
  vae?: string | { image?: string; audio?: string };
}

/** A validated model entry matching the models.config.json schema. */
export interface ModelConfigEntry {
  id: string;
  name: string;
  type: string;
  modalities: string[];
  description: string;
  components: ModelComponents;
  /**
   * Architecture variant that determines how component files are wired together:
   * - `bundled-checkpoint`: single file bundles UNet + text encoder(s) + VAE.
   * - `separate-diffusion-model`: standalone diffusion model with separate VAE and text encoder.
   * - `separate-unet-dual-clip-image-vae`: separate UNet, CLIP-L, CLIP-G, and image VAE files.
   * - `separate-unet-multi-vae`: shared UNet with distinct image VAE and audio VAE files.
   */
  architecture: Architecture;
}

function validateComponents(raw: unknown, index: number): ModelComponents {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`models[${index}].components must be an object`);
  }
  const c = raw as Record<string, unknown>;

  if (c.checkpoint !== undefined && typeof c.checkpoint !== "string")
    throw new Error(`models[${index}].components.checkpoint must be a string`);

  if (c.unet !== undefined && typeof c.unet !== "string")
    throw new Error(`models[${index}].components.unet must be a string`);

  if (c.clip !== undefined) {
    const isStringOrArray =
      typeof c.clip === "string" ||
      (Array.isArray(c.clip) && (c.clip as unknown[]).every((s) => typeof s === "string"));
    if (!isStringOrArray)
      throw new Error(`models[${index}].components.clip must be a string or array of strings`);
  }

  if (c.diffusion_model !== undefined && typeof c.diffusion_model !== "string")
    throw new Error(`models[${index}].components.diffusion_model must be a string`);

  if (c.text_encoder !== undefined && typeof c.text_encoder !== "string")
    throw new Error(`models[${index}].components.text_encoder must be a string`);

  if (c.vae !== undefined) {
    if (typeof c.vae === "string") {
      // single filename — valid
    } else if (typeof c.vae === "object" && c.vae !== null && !Array.isArray(c.vae)) {
      const vae = c.vae as Record<string, unknown>;
      if (vae.image !== undefined && typeof vae.image !== "string")
        throw new Error(`models[${index}].components.vae.image must be a string`);
      if (vae.audio !== undefined && typeof vae.audio !== "string")
        throw new Error(`models[${index}].components.vae.audio must be a string`);
    } else {
      throw new Error(`models[${index}].components.vae must be a string or object`);
    }
  }

  return c as ModelComponents;
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

  const components = validateComponents(e.components, index);

  if (typeof e.architecture !== "string" || !VALID_ARCHITECTURES.has(e.architecture))
    throw new Error(`models[${index}].architecture must be one of: ${ARCHITECTURES.join(", ")}`);

  return {
    id: e.id,
    name: e.name,
    type: e.type,
    modalities: e.modalities as string[],
    description: e.description,
    components,
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
