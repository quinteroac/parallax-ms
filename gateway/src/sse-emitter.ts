/** SSE subscriber registry for job terminal events. */

export interface JobTerminalEvent {
  id: string;
  status: "succeeded" | "failed";
  url?: string;
  error?: string;
}

type Listener = (event: JobTerminalEvent) => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribes to terminal events for a job. Returns an unsubscribe function. */
export function subscribe(jobId: string, listener: Listener): () => void {
  if (!listeners.has(jobId)) {
    listeners.set(jobId, new Set());
  }
  listeners.get(jobId)!.add(listener);
  return () => {
    const set = listeners.get(jobId);
    if (set) {
      set.delete(listener);
      if (set.size === 0) listeners.delete(jobId);
    }
  };
}

/** Emits a terminal event to all subscribers for a job. */
export function emit(jobId: string, event: JobTerminalEvent): void {
  listeners.get(jobId)?.forEach((l) => l(event));
}

/** Clears all listeners — exposed for test isolation. */
export function clearListeners(): void {
  listeners.clear();
}
