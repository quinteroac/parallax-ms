import { Elysia, t } from "elysia";
import { createJob, getJob } from "../job-store";
import { enqueueJob } from "../queue";

export const jobsRoutes = new Elysia({ prefix: "/v1" })
  .get(
    "/jobs/:id",
    ({ params, set }) => {
      const job = getJob(params.id);
      if (!job) {
        set.status = 404;
        return { error: "Job not found" };
      }
      const response: Record<string, unknown> = {
        id: job.id,
        status: job.status,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      };
      if (job.url !== undefined) response.url = job.url;
      if (job.error !== undefined) response.error = job.error;
      return response;
    },
    { detail: { summary: "Get job status" } },
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
      if (typeof raw.type !== "string" || raw.type.length === 0) {
        set.status = 400;
        return { error: "`type` is required and must be a non-empty string" };
      }
      if (typeof raw.params !== "object" || raw.params === null || Array.isArray(raw.params)) {
        set.status = 400;
        return { error: "`params` is required and must be a plain object" };
      }
      set.status = 201;
      const job = createJob(raw.type, raw.params as Record<string, unknown>);
      enqueueJob(job);
      return { jobId: job.id };
    },
    {
      body: t.Any(),
      detail: { summary: "Create a new job" },
    },
  );
