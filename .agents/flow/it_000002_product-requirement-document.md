# Requirement: Gateway Async Job Lifecycle with Stub Worker (Phase 2)

## Context

Phase 1 delivered the repository foundation: monorepo layout, health routes, env templates, and documented install/run commands. Phase 2 introduces the full asynchronous job lifecycle so that a client can submit work, receive a `jobId` immediately, track progress via `GET /v1/job/:id`, and be notified of completion through a Server-Sent Events (SSE) channel — all without blocking on inference. A stub worker (FastAPI) simulates inference by writing a fake result and posting a completion callback to the gateway, enabling end-to-end validation before real model integration in Phase 3.

## Goals

- Enable clients to submit jobs and receive results asynchronously without blocking on inference.
- Wire the full job state machine (`pending → running → succeeded | failed`) across the gateway in-memory store, REST endpoint, and SSE channel.
- Validate the gateway ↔ worker contract (job forwarding + completion callback) with a stub worker so Phase 3 can swap in real inference transparently.
- Maintain the fixed stack: Bun/Elysia (gateway), uv/FastAPI (worker), p-queue (concurrency 1), dotenvx.

## User Stories

### US-001: Create a job

**As a** client application, **I want** to POST a job request to the gateway **so that** I receive a `jobId` immediately and the gateway handles the rest asynchronously.

**Acceptance Criteria:**
- [ ] `POST /v1/jobs` accepts a JSON body with at least `{ type: string, params: object }`.
- [ ] Gateway assigns a UUID `jobId`, stores initial state `{ id, type, params, status: "pending", createdAt }` in an in-memory map.
- [ ] Response is `201 Created` with body `{ jobId }` — no inference blocking.
- [ ] Requesting the same endpoint with a missing or malformed body returns `400 Bad Request` with a descriptive error message.
- [ ] Typecheck / lint passes.

---

### US-002: Queue forwards job to the stub worker

**As a** gateway, **I want** to enqueue the job with p-queue (concurrency 1) and forward it to the worker **so that** only one inference request is in flight at a time.

**Acceptance Criteria:**
- [ ] p-queue is configured with `concurrency: 1`; a second job submitted while one is running waits in the queue.
- [ ] When the job reaches the front of the queue, gateway POSTs `{ id, type, params }` to the worker's `POST /infer` endpoint.
- [ ] On receipt of `202` from the worker, gateway updates job status to `"running"` in the in-memory map.
- [ ] If the worker is unreachable, job status is set to `"failed"` with an error message; no silent hang.
- [ ] Typecheck / lint passes.

---

### US-003: Get job status

**As a** client application, **I want** to call `GET /v1/job/:id` **so that** I can poll the current state of any job.

**Acceptance Criteria:**
- [ ] `GET /v1/jobs/:id` returns `200 OK` with a JSON body containing at least `{ id, status, createdAt, updatedAt }`.
- [ ] When the job has succeeded, the body also includes `{ url: string }` pointing to the result asset.
- [ ] When the job has failed, the body includes `{ error: string }`.
- [ ] Requesting an unknown `id` returns `404 Not Found`.
- [ ] Typecheck / lint passes.

---

### US-004: SSE channel per job

**As a** client application, **I want** to open an SSE connection for a specific `jobId` **so that** I am notified of completion without polling.

**Acceptance Criteria:**
- [ ] `GET /v1/jobs/:id/events` opens an SSE stream with `Content-Type: text/event-stream`.
- [ ] When the job transitions to `"succeeded"` or `"failed"`, the gateway emits an SSE event with data `{ id, status, url? , error? }`.
- [ ] After emitting the terminal event, the gateway closes the SSE stream immediately.
- [ ] A client connecting after the job is already complete receives the terminal event immediately and the stream closes cleanly.
- [ ] Requesting an SSE stream for an unknown `id` returns `404 Not Found`.
- [ ] Typecheck / lint passes.

---

### US-005: Stub worker accepts infer requests and runs a background task

**As a** worker, **I want** to accept `POST /infer`, respond with `202 Accepted` immediately, and complete work in a background task **so that** the gateway is never blocked waiting for inference.

**Acceptance Criteria:**
- [ ] `POST /infer` body is validated by a Pydantic model: `{ id: str, type: str, params: dict }`.
- [ ] Response is `202 Accepted` with body `{ message: "accepted" }` — no blocking.
- [ ] Background task waits a short fixed delay (e.g. 2 s) to simulate inference, then POSTs `{ id, url }` to the gateway's `POST /worker/done` endpoint; `url` is a placeholder string (e.g. `"http://localhost/assets/<id>.png"`).
- [ ] If the gateway callback URL is unreachable, the worker logs the error; it does not crash or retry infinitely.
- [ ] Worker health endpoint (`GET /health`) still responds `200` while a background task is running.
- [ ] Typecheck / lint passes (ruff).

---

### US-006: Gateway receives completion callback and emits SSE

**As a** gateway, **I want** to receive `POST /worker/done` from the worker **so that** I can update the job map and notify the client via SSE.

**Acceptance Criteria:**
- [ ] `POST /worker/done` accepts `{ id: string, url: string }`.
- [ ] Gateway updates the in-memory job entry: `status → "succeeded"`, `url` set, `updatedAt` refreshed.
- [ ] Gateway emits an SSE event `{ id, status: "succeeded", url }` to any open subscriber for that `jobId`.
- [ ] Posting with an unknown `id` returns `404 Not Found`; no state mutation occurs.
- [ ] Typecheck / lint passes.

---

### US-007: End-to-end smoke test (manual)

**As a** developer, **I want** to run a documented manual smoke test **so that** I can verify the full job lifecycle works before merging.

**Acceptance Criteria:**
- [ ] README or a `docs/smoke-test.md` file documents the exact steps: start gateway, start worker, POST a job, open SSE stream, observe completion event, GET final job status.
- [ ] Following those steps produces: `jobId` returned → status `"pending"` → status `"running"` → SSE event received → status `"succeeded"` with a `url` field.

---

### US-008: Automated tests for critical paths

**As a** developer, **I want** automated tests covering the job lifecycle critical paths **so that** regressions are caught early.

**Acceptance Criteria:**
- [ ] Gateway: at least one Vitest (or Bun test runner) test covers `POST /v1/jobs` → `GET /v1/jobs/:id` status progression.
- [ ] Gateway: at least one test verifies `GET /v1/jobs/:id` returns `404` for an unknown id.
- [ ] Worker: at least one pytest test covers `POST /infer` returning `202` and the Pydantic validation rejecting a bad body.
- [ ] All tests pass with `bun test` (gateway) and `uv run pytest` (worker).
- [ ] Typecheck / lint passes for test files.

---

## Functional Requirements

- **FR-1:** Gateway exposes `POST /v1/jobs`, `GET /v1/jobs/:id`, `GET /v1/jobs/:id/events`, and `POST /worker/done`.
- **FR-2:** Job state machine has exactly four states: `pending`, `running`, `succeeded`, `failed`; transitions are one-way.
- **FR-3:** In-memory job store is a `Map<string, Job>` (or equivalent); no external database in this phase.
- **FR-4:** p-queue instance is configured with `concurrency: 1` and shared across the gateway process lifetime.
- **FR-5:** Worker callback URL (gateway base URL) is read from an environment variable (e.g. `GATEWAY_URL`), not hardcoded.
- **FR-6:** Gateway base URL for outbound worker requests is read from an environment variable (e.g. `WORKER_URL`), not hardcoded.
- **FR-7:** Stub worker background task uses a fixed simulated delay (configurable via env var, default 2 s).
- **FR-8:** SSE stream auto-closes immediately after a terminal event (`succeeded` or `failed`) is emitted; connections are also cleaned up if the client disconnects early.

## Non-Goals (Out of Scope)

- Real inference via comfy-diffusion (Phase 3).
- Persistent job store / database (Phase 8 optional stretch).
- Portless or HTTPS tunnel setup (optional, not required for Phase 2 done criteria).
- Model discovery endpoints (Phase 4).
- Retry logic for failed worker callbacks (Phase 8 optional stretch).
- Authentication or authorization between gateway and worker.
- Job cancellation or queue drain endpoints.

## Open Questions

None.
