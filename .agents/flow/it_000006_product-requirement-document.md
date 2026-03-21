# Requirement: txt2img and img2img Inference for All Model Architectures

## Context
The worker currently runs `txt2img` inference with a single hardcoded `bundled-checkpoint` architecture loaded at startup. The gateway dispatches jobs without forwarding architecture or component information. This iteration wires up multi-architecture inference (`bundled-checkpoint`, `separate-diffusion-model`, `separate-unet-dual-clip-image-vae`, `separate-unet-multi-vae`) for both `txt2img` and `img2img` modalities exclusively using `comfy-diffusion`, and extends the playground to support dynamic model selection and image input.

## Goals
- Enable clients to submit `txt2img` and `img2img` jobs against any architecture registered in `models.config.json`.
- Worker correctly routes each job to the appropriate `comfy-diffusion` pipeline based on architecture and modality.
- Playground allows model selection and `img2img` (with file upload) without a separate frontend server.

## User Stories

Each story must be small enough to implement in one focused session.

### US-001: Gateway forwards architecture and component info to the worker
**As a** gateway queue dispatcher, **I want** the `/infer` payload to include `modelId`, `modality`, `architecture`, and the model's `components` map **so that** the worker can select the correct pipeline without independently reading the model config.

**Acceptance Criteria:**
- [ ] `queue.ts` looks up the dispatched job's model entry (by `job.modelId`) from the loaded config and merges `modelId`, `modality`, `architecture`, and `components` into the body sent to `POST /infer`.
- [ ] The worker's `InferRequest` Pydantic model declares and validates the new fields (`modality: str`, `architecture: str`, `components: dict`).
- [ ] Existing tests pass; typecheck / lint passes.

### US-002: Worker runs txt2img for all 4 architectures
**As an** API client, **I want** the worker to run `txt2img` inference for all 4 supported architectures using `comfy-diffusion` **so that** any model registered in `models.config.json` can generate images.

**Acceptance Criteria:**
- [ ] `startup.py` no longer loads a single hardcoded checkpoint at startup; model loading is performed per-request in `tasks.py` using architecture and components from the request body.
- [ ] `tasks.py` routes `modality=txt2img` to the correct `comfy-diffusion` loading + pipeline call for each architecture: `bundled-checkpoint`, `separate-diffusion-model`, `separate-unet-dual-clip-image-vae`, `separate-unet-multi-vae`.
- [ ] An unsupported architecture value triggers an error callback to `/worker/done` with a descriptive `error` field (no silent failure).
- [ ] The output `.png` is written to `OUTPUT_DIR` and the callback URL is `{GATEWAY_CALLBACK_URL}/outputs/{id}.png`.
- [ ] Typecheck / lint passes.

### US-003: Worker runs img2img for all 4 architectures
**As an** API client, **I want** the worker to run `img2img` inference **so that** I can condition generation on an existing image.

**Acceptance Criteria:**
- [ ] `InferRequest` accepts `source_image: str` (base64-encoded PNG or JPG) and `denoise_strength: float` (0.0–1.0, default `0.75`) for img2img jobs.
- [ ] `tasks.py` routes `modality=img2img` to the correct `comfy-diffusion` img2img pipeline for each of the 4 architectures.
- [ ] If `source_image` is absent when `modality=img2img`, the worker POSTs an error callback with a clear `error` message.
- [ ] If the base64 payload is invalid (cannot be decoded to a valid image), the worker POSTs an error callback.
- [ ] Typecheck / lint passes.

### US-004: txt2img end-to-end verified
**As an** API client, **I want** to submit a `txt2img` job and receive the result image URL via SSE **so that** I can verify the full gateway-to-worker pipeline.

**Acceptance Criteria:**
- [ ] `POST /v1/jobs` with valid `modelId`, `modality=txt2img`, and `params` (at minimum: `prompt`) returns `{ jobId }` with HTTP 201.
- [ ] The worker infers, writes a `.png` to `OUTPUT_DIR`, and POSTs `{ id, url }` to `/worker/done`.
- [ ] `GET /v1/jobs/:id` returns `{ status: "succeeded", url: "..." }`.
- [ ] The SSE event on `GET /v1/jobs/:id/events` fires with `{ status: "succeeded", url: "..." }`.
- [ ] The image is accessible at the returned URL and renders correctly. Visually verified in browser.

### US-005: Playground supports model selection and img2img
**As an** end user, **I want** the playground to let me pick any available model and switch between `txt2img` and `img2img` modes **so that** I can test inference interactively without writing API calls.

**Acceptance Criteria:**
- [ ] On load, the playground fetches `GET /v1/models` and populates a `<select>` with each model's `id` (value) and `name` (label).
- [ ] A visible toggle (radio buttons or tab) switches between `txt2img` and `img2img` modes; the active mode updates the submitted `modality` and visible form fields.
- [ ] In `img2img` mode, a file `<input>` (accept `image/*`) appears; the selected file is read via `FileReader` and sent as base64 in `params.source_image`.
- [ ] A `denoise_strength` range input (0.0–1.0, step 0.05, default 0.75) is shown in `img2img` mode and included in `params`.
- [ ] The form submits `{ modelId, modality, params }` to `POST /v1/jobs`; SSE and image display work the same as the existing flow.
- [ ] Visually verified in browser for both `txt2img` and `img2img` with a real model.

## Functional Requirements
- FR-1: `queue.ts` must include `modelId`, `modality`, `architecture`, and `components` in every body sent to `POST /infer`.
- FR-2: `InferRequest` must declare: `modality: str`, `architecture: str`, `components: dict`, `source_image: str | None = None`, `denoise_strength: float = 0.75`.
- FR-3: The worker must load model weights at inference time from the `components` paths in the request; the `MODELS_DIR` env var provides the base directory for relative component paths.
- FR-4: Worker must implement `txt2img` for all 4 architectures exclusively via `comfy-diffusion` (no direct ComfyUI API calls, no other inference libraries).
- FR-5: Worker must implement `img2img` for all 4 architectures exclusively via `comfy-diffusion`.
- FR-6: Any unsupported architecture or missing required component must result in an error callback — no silent fallback or stub success.
- FR-7: Playground model selector is populated dynamically from `GET /v1/models` on page load; a loading/error state is shown if the fetch fails.
- FR-8: Playground sends the selected `modelId` as a top-level field alongside `modality` and `params` in the `POST /v1/jobs` body.
- FR-9: Source image is transmitted as a base64-encoded string inside `params.source_image` (no separate upload endpoint required).

## Non-Goals (Out of Scope)
- Video, audio, or upscale modalities.
- Model caching / LRU eviction between requests (Phase 8).
- Authentication or API keys.
- Persistent job store (remains in-memory).
- Retry logic for the worker callback.
- A gallery of previously generated images across sessions.

## Open Questions
- Should a failed model load (e.g. missing component file) surface as `status: "failed"` immediately on dispatch, or only after the worker's async background task runs and sends the error callback?
