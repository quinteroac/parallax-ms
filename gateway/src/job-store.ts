/** In-memory job store for Phase 1. */

export type JobStatus = "pending" | "running" | "failed";

export interface Job {
  id: string;
  type: string;
  params: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
  error?: string;
}

const store = new Map<string, Job>();

export function createJob(type: string, params: Record<string, unknown>): Job {
  const id = crypto.randomUUID();
  const job: Job = {
    id,
    type,
    params,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  store.set(id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return store.get(id);
}

/** Updates status (and optional error) for an existing job. */
export function updateJob(id: string, patch: { status: JobStatus; error?: string }): void {
  const job = store.get(id);
  if (!job) return;
  job.status = patch.status;
  if (patch.error !== undefined) job.error = patch.error;
}

/** Clears all jobs — exposed for test isolation. */
export function clearJobs(): void {
  store.clear();
}
