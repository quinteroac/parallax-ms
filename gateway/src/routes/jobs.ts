import { Elysia, t } from "elysia";
import { createJob, getJob, type JobStatus } from "../job-store";
import { findModelById, loadModels } from "../model-store";
import type { ModelsResponse } from "../model-store";
import { enqueueJob } from "../queue";
import { type JobTerminalEvent, subscribe } from "../sse-emitter";

type Loader = () => ModelsResponse;

function sseEvent(event: JobTerminalEvent): string {
  const data: Record<string, unknown> = { id: event.id, status: event.status };
  if (event.url !== undefined) data.url = event.url;
  if (event.error !== undefined) data.error = event.error;
  return `data: ${JSON.stringify(data)}\n\n`;
}

/** Factory so tests can inject a custom loader (e.g. one that throws). */
export function createJobsRoutes(loader: Loader = loadModels) {
  return new Elysia({ prefix: "/v1" })
    .get(
      "/jobs/:id/events",
      ({ params }) => {
        const job = getJob(params.id);
        if (!job) {
          return new Response(JSON.stringify({ error: "Job not found" }), {
            status: 404,
            headers: { "content-type": "application/json" },
          });
        }

        const isTerminal = job.status === "succeeded" || job.status === "failed";
        let unsubscribe: (() => void) | undefined;

        let heartbeat: ReturnType<typeof setInterval> | undefined;

        const stream = new ReadableStream<string>({
          start(controller) {
            const send = (evt: JobTerminalEvent) => {
              clearInterval(heartbeat);
              controller.enqueue(sseEvent(evt));
              controller.close();
            };

            if (isTerminal) {
              send({
                id: job.id,
                status: job.status as "succeeded" | "failed",
                url: job.url,
                error: job.error,
              });
              return;
            }

            heartbeat = setInterval(() => {
              controller.enqueue(": ping\n\n");
            }, 15_000);

            unsubscribe = subscribe(params.id, (evt) => {
              unsubscribe?.();
              unsubscribe = undefined;
              send(evt);
            });
          },
          cancel() {
            clearInterval(heartbeat);
            unsubscribe?.();
          },
        });

        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
          },
        });
      },
      { detail: { summary: "Subscribe to job terminal event via SSE" } },
    )
    .get(
      "/jobs/:id",
      ({ params, set }) => {
        const job = getJob(params.id);
        if (!job) {
          set.status = 404;
          return { error: "Job not found" };
        }
        const response: {
          id: string;
          status: JobStatus;
          createdAt: string;
          updatedAt: string;
          modelId: string;
          modality: string;
          url?: string;
          error?: string;
        } = {
          id: job.id,
          status: job.status,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          modelId: job.modelId ?? "",
          modality: job.modality ?? "",
        };
        if (job.status === "succeeded" && job.url !== undefined) response.url = job.url;
        if (job.status === "failed" && job.error !== undefined) response.error = job.error;
        return response;
      },
      {
        response: {
          200: t.Object({
            id: t.String(),
            status: t.Union([
              t.Literal("pending"),
              t.Literal("running"),
              t.Literal("succeeded"),
              t.Literal("failed"),
            ]),
            createdAt: t.String(),
            updatedAt: t.String(),
            modelId: t.String(),
            modality: t.String(),
            url: t.Optional(t.String()),
            error: t.Optional(t.String()),
          }),
          404: t.Object({ error: t.String() }),
        },
        detail: { summary: "Get job status" },
      },
    )
    .post(
      "/jobs",
      ({ body, set }) => {
        // Manual validation — Elysia coerces TypeBox schemas, so validate raw values.
        if (typeof body !== "object" || body === null || Array.isArray(body)) {
          set.status = 400;
          return { error: "Request body must be a JSON object" };
        }
        const raw = body as Record<string, unknown>;

        if (typeof raw.modelId !== "string" || raw.modelId.length === 0) {
          set.status = 400;
          return { error: "`modelId` is required and must be a non-empty string" };
        }

        if (typeof raw.modality !== "string" || raw.modality.length === 0) {
          set.status = 400;
          return { error: "`modality` is required and must be a non-empty string" };
        }

        if (typeof raw.params !== "object" || raw.params === null || Array.isArray(raw.params)) {
          set.status = 400;
          return { error: "`params` is required and must be a plain object" };
        }

        let models: ModelsResponse;
        try {
          models = loader();
        } catch {
          set.status = 503;
          return { error: "Model configuration unavailable" };
        }

        const model = findModelById(models, raw.modelId);
        if (!model) {
          set.status = 422;
          return { error: `Model not found: ${raw.modelId}` };
        }

        if (!model.modalities.includes(raw.modality)) {
          set.status = 400;
          return {
            error: `Modality '${raw.modality}' is not supported by model '${raw.modelId}'`,
          };
        }

        if (raw.modality === "upscale") {
          const params = raw.params as Record<string, unknown>;
          if (!params.source_image) {
            set.status = 400;
            return { error: "`source_image` is required in `params` for upscale jobs" };
          }
        }

        // img2vid requires a top-level `inputImage` field (base64 or URL string).
        // width, height, and duration (in seconds) are accepted as optional numeric
        // fields inside `params` for both txt2vid and img2vid jobs.
        if (raw.modality === "img2vid") {
          if (typeof raw.inputImage !== "string" || raw.inputImage.length === 0) {
            set.status = 400;
            return { error: "`inputImage` is required for `img2vid` jobs" };
          }
        }

        if (raw.modality === "txt2vid" || raw.modality === "img2vid") {
          const vp = raw.params as Record<string, unknown>;
          if (vp.width !== undefined) {
            if (!Number.isInteger(vp.width) || (vp.width as number) <= 0) {
              set.status = 400;
              return { error: "`width` must be a positive integer" };
            }
          }
          if (vp.height !== undefined) {
            if (!Number.isInteger(vp.height) || (vp.height as number) <= 0) {
              set.status = 400;
              return { error: "`height` must be a positive integer" };
            }
          }
          if (vp.duration !== undefined) {
            if (typeof vp.duration !== "number" || (vp.duration as number) <= 0) {
              set.status = 400;
              return { error: "`duration` must be a positive number" };
            }
          }
        }

        if (raw.modality === "txt2audio") {
          const ap = raw.params as Record<string, unknown>;
          if (typeof ap.prompt !== "string" || ap.prompt.length === 0) {
            set.status = 400;
            return {
              error: "`prompt` is required and must be a non-empty string for `txt2audio` jobs",
            };
          }
        }

        set.status = 201;
        // For img2vid jobs, fold the top-level inputImage into params as source_image
        // so the worker receives it in the forwarded request body.
        const jobParams: Record<string, unknown> =
          raw.modality === "img2vid"
            ? { ...(raw.params as Record<string, unknown>), source_image: raw.inputImage }
            : (raw.params as Record<string, unknown>);
        const job = createJob(model.type, jobParams, {
          modelId: raw.modelId,
          modality: raw.modality,
        });
        enqueueJob(job);
        return { jobId: job.id };
      },
      {
        body: t.Any(),
        detail: { summary: "Create a new job" },
      },
    );
}

export const jobsRoutes = createJobsRoutes();
