/** Job queue — forwards work to the worker with concurrency 1. */

import PQueue from "p-queue";
import { type Job, updateJob } from "./job-store";
import { findModelById, loadModels } from "./model-store";

export const queue = new PQueue({ concurrency: 1 });

async function dispatchJob(job: Job): Promise<void> {
  const workerBaseUrl = process.env.WORKER_BASE_URL ?? "http://localhost:8000";

  const body: Record<string, unknown> = { id: job.id, ...job.params };

  if (job.modelId) {
    let models;
    try {
      models = loadModels();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: `Model configuration unavailable: ${message}` });
      return;
    }
    const model = findModelById(models, job.modelId);
    if (!model) {
      updateJob(job.id, { status: "failed", error: `Model not found: ${job.modelId}` });
      return;
    }
    body.modelId = job.modelId;
    body.modality = job.modality;
    body.architecture = model.architecture;
    body.components = model.components;
  }

  try {
    const res = await fetch(`${workerBaseUrl}/infer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 202) {
      updateJob(job.id, { status: "running" });
    } else {
      updateJob(job.id, {
        status: "failed",
        error: `Worker returned unexpected status: ${res.status}`,
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: `Worker unreachable: ${message}` });
  }
}

/** Adds the job to the queue; returns immediately without blocking. */
export function enqueueJob(job: Job): void {
  void queue.add(() => dispatchJob(job));
}
