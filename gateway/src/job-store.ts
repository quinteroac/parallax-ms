/** In-memory job store for Phase 1. */

export type JobStatus = "pending";

export interface Job {
  id: string;
  type: string;
  params: Record<string, unknown>;
  status: JobStatus;
  createdAt: string;
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

/** Clears all jobs — exposed for test isolation. */
export function clearJobs(): void {
  store.clear();
}
