import { Elysia } from "elysia";
import { MODEL_TYPES, type ModelType, type ModelsResponse, loadModels } from "../model-store";

type Loader = () => ModelsResponse;

/** Factory so tests can inject a custom loader (e.g. one that throws). */
export function createModelsRoutes(loader: Loader = loadModels) {
  return new Elysia({ prefix: "/v1" }).get(
    "/models",
    ({ set, query }) => {
      let all: ModelsResponse;
      try {
        all = loader();
      } catch {
        set.status = 503;
        return { error: "Model configuration unavailable" };
      }

      const rawType = (query as Record<string, string | undefined>).type;
      if (rawType === undefined) {
        return all;
      }

      const normalised = rawType.toLowerCase();
      if (!(MODEL_TYPES as readonly string[]).includes(normalised)) {
        set.status = 400;
        return {
          error: "Invalid type. Valid values: images, video, editing, audio, upscalers",
        };
      }

      return { [normalised]: all[normalised as ModelType] };
    },
    { detail: { summary: "List all models grouped by type" } },
  );
}

export const modelsRoutes = createModelsRoutes();
