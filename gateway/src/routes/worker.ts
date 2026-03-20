/** Worker callback routes. */
import { Elysia, t } from "elysia";
import { getJob, updateJob } from "../job-store";

export const workerRoutes = new Elysia().post(
  "/worker/done",
  ({ body, set }) => {
    // Manual validation — ensure id and url are non-empty strings.
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      set.status = 400;
      return { error: "Request body must be a JSON object" };
    }
    const raw = body as Record<string, unknown>;
    if (typeof raw.id !== "string" || raw.id.length === 0) {
      set.status = 400;
      return { error: "`id` is required and must be a non-empty string" };
    }
    if (typeof raw.url !== "string" || raw.url.length === 0) {
      set.status = 400;
      return { error: "`url` is required and must be a non-empty string" };
    }

    const job = getJob(raw.id);
    if (!job) {
      set.status = 404;
      return { error: "Job not found" };
    }

    updateJob(raw.id, { status: "succeeded", url: raw.url });
    return { ok: true };
  },
  {
    body: t.Any(),
    detail: { summary: "Receive completion callback from worker" },
  },
);
