import { Elysia } from "elysia";
import { type ModelsResponse, loadModels } from "../model-store";

type Loader = () => ModelsResponse;

/** Factory so tests can inject a custom loader (e.g. one that throws). */
export function createModelsRoutes(loader: Loader = loadModels) {
  return new Elysia({ prefix: "/v1" }).get(
    "/models",
    ({ set }) => {
      try {
        return loader();
      } catch {
        set.status = 503;
        return { error: "Model configuration unavailable" };
      }
    },
    { detail: { summary: "List all models grouped by type" } },
  );
}

export const modelsRoutes = createModelsRoutes();
