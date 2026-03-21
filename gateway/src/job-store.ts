/** In-memory job store for Phase 1. */
import { emit } from "./sse-emitter";

export type JobStatus = "pending" | "running" | "succeeded" | "failed";

export interface Job {
  id: string;
  type: string;
  modelId?: string;
  modality?: string;
  params: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  url?: string;
  error?: string;
}

const store = new Map<string, Job>();

export function createJob(
  type: string,
  params: Record<string, unknown>,
  extra?: { modelId?: string; modality?: string },
): Job {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const job: Job = {
    id,
    type,
    ...(extra?.modelId !== undefined && { modelId: extra.modelId }),
    ...(extra?.modality !== undefined && { modality: extra.modality }),
    params,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  store.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

/** Updates status (and optional url/error) for an existing job. */
export function updateJob(
  id: string,
  patch: { status: JobStatus; url?: string; error?: string },
): void {
  const job = store.get(id);
  if (!job) return;
  job.status = patch.status;
  job.updatedAt = new Date().toISOString();
  if (patch.url !== undefined) job.url = patch.url;
  if (patch.error !== undefined) job.error = patch.error;
  if (patch.status === "succeeded" || patch.status === "failed") {
    emit(id, { id: job.id, status: patch.status, url: job.url, error: job.error });
  }
}

/** Clears all jobs — exposed for test isolation. */
export function clearJobs(): void {
  store.clear();
}
