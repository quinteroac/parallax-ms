# Requirement: Phase 3 — Real Inference with comfy-diffusion

## Context

Iteration 000002 delivered a fully wired async job lifecycle with a **stub worker** — the worker accepted `POST /infer`, ran a fake background task, and sent a callback to the gateway. The stub is now replaced with **real `txt2img` inference** powered by `comfy-diffusion`. A hardcoded model and route are used for this phase; model discovery and versioned API contracts are deferred to Phase 4.

A basic **playground page** is also added so developers can submit jobs and inspect results in a browser without writing curl commands.

## Goals

- Replace the stub inference path with a working `comfy-diffusion` `txt2img` pipeline.
- Write generated images to disk and serve them via a static URL included in the gateway callback.
- Surface worker errors (runtime failure, model load failure, inference error) as `failed` job state, visible via SSE and `GET /v1/job/:id`.
- Provide a minimal browser-based playground for manual end-to-end testing.
- Validate the full pipeline with an automated end-to-end test.

## User Stories

### US-001: Validated infer payload

**As a** client application, **I want** the worker to validate the `POST /infer` request body **so that** malformed requests are rejected immediately with a clear error before inference is attempted.

**Acceptance Criteria:**
- [ ] Worker defines a Pydantic model (e.g. `InferRequest`) with fields: `id` (str), `prompt` (str), `negative_prompt` (str, default `""`), `width` (int, default 512), `height` (int, default 512), `steps` (int, default 20), `cfg` (float, default 7.0), `seed` (int, default 0), `sampler_name` (str, default `"euler"`), `scheduler` (str, default `"normal"`).
- [ ] A request missing the required `id` or `prompt` fields returns **422 Unprocessable Entity**.
- [ ] A valid request returns **202 Accepted** as before.
- [ ] Typecheck / lint passes.

---

### US-002: Runtime bootstrap and model load at startup

**As a** worker process, **I want** to call `check_runtime()` and load the hardcoded checkpoint on startup **so that** inference requests can be served without cold-loading the model on the first request.

**Acceptance Criteria:**
- [ ] Worker calls `comfy_diffusion.check_runtime()` during application startup (e.g. FastAPI lifespan handler).
- [ ] If `check_runtime()` returns an `"error"` key, the worker logs the error and exits with a non-zero code.
- [ ] `ModelManager` is instantiated with `MODELS_DIR` (from env var, see FR-3) and `load_checkpoint(CHECKPOINT_FILENAME)` is called once at startup.
- [ ] If the checkpoint file does not exist or fails to load, the worker logs the error and exits with a non-zero code.
- [ ] `GET /health` returns **200 OK** only after the runtime and model are loaded successfully.
- [ ] Typecheck / lint passes.

---

### US-003: txt2img inference writes artifact to disk

**As a** client application, **I want** the worker to run real `txt2img` inference **so that** a generated image is available on disk after the job completes.

**Acceptance Criteria:**
- [ ] Background task runs the full pipeline: `encode_prompt` (positive + negative) → `empty_latent_image` → `sample` → `vae_decode` → save PIL `Image` as PNG to `OUTPUT_DIR/{job_id}.png` (see FR-5).
- [ ] `sample()` uses `sampler_name`, `scheduler`, `steps`, `cfg`, and `seed` from the validated request.
- [ ] The output file exists on disk after the background task completes.
- [ ] Typecheck / lint passes.

---

### US-004: Generated image served and URL included in callback

**As a** client application, **I want** the callback from the worker to include a URL pointing to the generated image **so that** I can fetch the result after receiving the SSE completion event.

**Acceptance Criteria:**
- [ ] Worker serves output images as static files (see FR-6).
- [ ] After saving the image, the worker POSTs `{ "id": job_id, "url": "<served image URL>" }` to the gateway's `/worker/done` endpoint.
- [ ] `GET /v1/job/:id` on the gateway returns `{ "status": "succeeded", "url": "<image URL>" }` after the callback is received.
- [ ] The image URL is reachable via HTTP and returns the PNG file.
- [ ] Typecheck / lint passes.

---

### US-005: Worker errors propagate as failed job state

**As a** client application, **I want** inference errors to be surfaced as a `failed` job status **so that** I am not left waiting forever on a job that will never complete.

**Acceptance Criteria:**
- [ ] If inference throws an exception, the worker POSTs `{ "id": job_id, "error": "<message>" }` to `/worker/done` (or a dedicated error callback — see FR-7).
- [ ] Gateway updates the job state to `failed` and emits an SSE event (e.g. `{ "status": "failed", "error": "..." }`).
- [ ] `GET /v1/job/:id` returns `{ "status": "failed", "error": "<message>" }`.
- [ ] No silent hangs: if the background task errors, the callback is always sent.
- [ ] Typecheck / lint passes.

---

### US-006: Basic playground page for manual testing

**As a** developer, **I want** a simple browser UI **so that** I can submit a `txt2img` job, watch the SSE stream, and see the generated image without writing curl commands.

**Acceptance Criteria:**
- [ ] Gateway serves a static HTML page at `GET /playground`.
- [ ] Page contains a form with fields: **Prompt** (text), **Negative prompt** (text, optional), **Steps** (number, default 20), **Seed** (number, default 0).
- [ ] On submit, the page calls the gateway job creation endpoint, opens an SSE connection for the returned `jobId`, and displays a loading indicator.
- [ ] On SSE completion event, the page displays the generated image inline.
- [ ] On SSE error event, the page displays the error message.
- [ ] Visually verified in browser: form submits, image appears, error state is visible.
- [ ] Typecheck / lint passes.

---

### US-007: Automated end-to-end test

**As a** developer, **I want** an automated test that exercises the full inference path **so that** regressions are caught without manual intervention.

**Acceptance Criteria:**
- [ ] A pytest test (in `worker/tests/`) submits a minimal `txt2img` request directly to the worker's `POST /infer` endpoint (or via the full gateway → worker path if integration test).
- [ ] Test asserts the output PNG file is created on disk within a reasonable timeout.
- [ ] Test asserts the callback payload contains a valid `url` field (can be verified against the static file path).
- [ ] Test is skipped automatically if `MODELS_DIR` / `CHECKPOINT_FILENAME` env vars are not set (to allow CI runs without GPU/model files).
- [ ] `uv run pytest` passes (or skips gracefully) in a clean environment.

---

## Functional Requirements

- **FR-1:** Worker defines a Pydantic `InferRequest` model with fields: `id`, `prompt`, `negative_prompt` (default `""`), `width` (default 512), `height` (default 512), `steps` (default 20), `cfg` (default 7.0), `seed` (default 0), `sampler_name` (default `"euler"`), `scheduler` (default `"normal"`).
- **FR-2:** Worker calls `comfy_diffusion.check_runtime()` in the FastAPI lifespan handler before accepting traffic; exits non-zero on failure.
- **FR-3:** Worker reads two env vars: `MODELS_DIR` (path to the models directory passed to `ModelManager`) and `CHECKPOINT_FILENAME` (filename under `models_dir/checkpoints/` passed to `load_checkpoint`). Both are required at startup; missing values cause startup failure with a clear log message.
- **FR-4:** `txt2img` pipeline (called in background task): `encode_prompt(clip, prompt)` + `encode_prompt(clip, negative_prompt)` → `empty_latent_image(width, height)` → `sample(model, positive, negative, latent, steps, cfg, sampler_name, scheduler, seed)` → `vae_decode(vae, latent)` → save PIL Image as PNG.
- **FR-5:** Output images are saved to `OUTPUT_DIR/{job_id}.png`. `OUTPUT_DIR` is configurable via env var (default: `./outputs`).
- **FR-6:** The **gateway** serves the output directory as static files (e.g. Elysia static mount). The served URL for a job is `<GATEWAY_BASE_URL>/outputs/{job_id}.png`. Worker and gateway must share (or mount) the same `OUTPUT_DIR` path so the gateway can serve files written by the worker.
- **FR-7:** On any exception in the background task, the worker sends a completion callback with `{ "id": job_id, "error": "<str(exception)>" }`. Gateway maps this to `status: "failed"`.
- **FR-8:** Gateway `/worker/done` handler accepts an optional `error` field in the body; if present, sets job `status` to `"failed"` and includes the error in the SSE event and `GET /v1/job/:id` response.
- **FR-9:** Gateway serves a static HTML playground at `GET /playground` with the form and SSE client logic described in US-006.
- **FR-10:** `MODELS_DIR`, `CHECKPOINT_FILENAME`, and `OUTPUT_DIR` are added to `worker/.env.example` as documented placeholders.

## Non-Goals (Out of Scope)

- Model discovery API — listing installed models by type (deferred to Phase 4).
- Multiple inference modalities (`txt2vid`, `img2img`, `img2vid`, `txt2audio`, `upscale`) — only `txt2img` is in scope.
- LoRA, ControlNet, or any advanced sampling options.
- LRU model eviction or memory pressure handling (Phase 8).
- Persistent job store — job state remains in-memory.
- Authentication between gateway and worker.
- Production deployment configuration.

## Open Questions

- None.
