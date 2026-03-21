# Requirement: Video Inference — txt2vid and img2vid

## Context

Parallax Media Server already supports image modalities (`txt2img`, `img2img`, `upscale`). Phase 6 of the roadmap extends the unified job + callback + SSE pipeline to **video** inference, enabling clients to generate MP4 videos from text prompts or input images using `comfy_diffusion` video pipelines.

## Goals

- Deliver `txt2vid` and `img2vid` inference end-to-end through the existing gateway → worker → artifact → callback → SSE path.
- Expose video models in the model discovery API with the correct modalities.
- Allow clients to control output resolution and duration via job parameters.
- Surface all failures clearly — no silent hangs or ambiguous success responses.
- Extend the playground UI to submit video jobs and display the resulting MP4.

## User Stories

### US-001: Model config includes video model entries

**As a** client, **I want** `GET /v1/models` to return video-capable models tagged with `txt2vid` and/or `img2vid` modalities **so that** I can discover which models to target when submitting video jobs.

**Acceptance Criteria:**
- [ ] `models.config.json` contains at least one model entry with `modality: ["txt2vid"]` and at least one with `modality: ["img2vid"]` (may be the same model if it supports both).
- [ ] `GET /v1/models` returns those entries with correct `id`, `architecture`, `modality`, and `components` fields.
- [ ] `GET /v1/models/:id` resolves each video model entry by its `id`.
- [ ] Typecheck / lint passes.

---

### US-002: Gateway accepts and validates video jobs

**As a** client, **I want** `POST /v1/jobs` to accept `txt2vid` and `img2vid` modalities with video-specific parameters **so that** I can enqueue video generation jobs without the gateway rejecting valid requests.

**Acceptance Criteria:**
- [ ] `POST /v1/jobs` with `modality: "txt2vid"` and a valid `modelId` returns `201` with a `jobId`.
- [ ] `POST /v1/jobs` with `modality: "img2vid"`, a valid `modelId`, and an `inputImage` field returns `201` with a `jobId`.
- [ ] Both requests accept `width`, `height`, and `duration` (in seconds or frames — document the unit) as optional numeric parameters.
- [ ] Submitting `modality: "txt2vid"` or `modality: "img2vid"` with a model that does not support those modalities returns `400` with a descriptive error message.
- [ ] Submitting `modality: "img2vid"` without an `inputImage` returns `400`.
- [ ] Typecheck / lint passes.

---

### US-003: Worker runs txt2vid inference end-to-end

**As a** client, **I want** a `txt2vid` job to run real video inference via `comfy_diffusion` and deliver a playable MP4 **so that** I receive a usable video artifact when the job completes.

**Acceptance Criteria:**
- [ ] Worker `POST /infer` accepts `modality: "txt2vid"` with `prompt`, `modelId`, `width`, `height`, `duration`, and all required `comfy_diffusion` parameters.
- [ ] Inference runs asynchronously after `202 Accepted`; the worker uses `comfy_diffusion` exclusively (no other inference library).
- [ ] Output is written to disk as an MP4 file in the configured output directory.
- [ ] Worker POSTs to gateway `/worker/done` with `{ id, url }` where `url` resolves to the MP4 artifact.
- [ ] Gateway updates job state to `succeeded` and fires the SSE event.
- [ ] `GET /v1/jobs/:id` returns `status: "succeeded"` and a non-empty `url` field pointing to the MP4.
- [ ] Worker propagates inference errors: job transitions to `failed` with an `error` field; no silent hangs.
- [ ] Typecheck / lint passes.

---

### US-004: Worker runs img2vid inference end-to-end

**As a** client, **I want** an `img2vid` job to accept an input image and produce an MP4 via `comfy_diffusion` **so that** I can animate a still image into a video clip.

**Acceptance Criteria:**
- [ ] Worker `POST /infer` accepts `modality: "img2vid"` with `inputImage` (URL or base64), `modelId`, `width`, `height`, `duration`, and all required `comfy_diffusion` parameters.
- [ ] Inference runs asynchronously after `202 Accepted` using `comfy_diffusion` exclusively.
- [ ] Output is written to disk as an MP4 file in the configured output directory.
- [ ] Worker POSTs to gateway `/worker/done` with `{ id, url }` where `url` resolves to the MP4 artifact.
- [ ] Gateway updates job state to `succeeded` and fires the SSE event.
- [ ] `GET /v1/jobs/:id` returns `status: "succeeded"` and a non-empty `url` field pointing to the MP4.
- [ ] Worker propagates inference errors: job transitions to `failed` with an `error` field.
- [ ] Typecheck / lint passes.

---

### US-005: Playground supports video mode

**As a** client, **I want** the playground UI to let me select a video model, choose a video modality, set resolution and duration, submit the job, and view the resulting MP4 **so that** I can manually verify the video pipeline end-to-end.

**Acceptance Criteria:**
- [ ] Model selector in the playground filters and displays video-capable models.
- [ ] When a video model is selected, the UI shows modality options (`txt2vid`, `img2vid`).
- [ ] `img2vid` mode shows an image upload or URL input field.
- [ ] Width, height, and duration inputs are present and submitted as part of the job payload.
- [ ] After job completion, the playground renders a `<video>` element pointing to the returned MP4 URL.
- [ ] Visually verified in browser.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** `models.config.json` schema and `loadModels()` / `findModelById()` utilities must support `txt2vid` and `img2vid` as valid modality values.
- **FR-2:** Gateway job creation endpoint must validate `width`, `height` (positive integers), and `duration` (positive number) when provided; reject invalid values with `400`.
- **FR-3:** Gateway must forward `width`, `height`, `duration`, and `inputImage` (for `img2vid`) to the worker `POST /infer` payload alongside existing fields (`architecture`, `components`, `modality`, flattened params).
- **FR-4:** Worker `POST /infer` Pydantic model must include `width`, `height`, `duration`, and `input_image` (optional) fields with appropriate types and validation.
- **FR-5:** Worker must invoke `comfy_diffusion` video pipelines exclusively — no fallback to other libraries.
- **FR-6:** All output artifacts must be MP4 files; the worker must reject or error if `comfy_diffusion` produces a non-MP4 output.
- **FR-7:** The MP4 artifact URL returned in the callback and `GET /v1/jobs/:id` must be accessible via an HTTP route (gateway static route or worker static route — match whatever pattern iteration 000006/000007 established).
- **FR-8:** `GET /v1/jobs/:id/events` SSE stream must emit the terminal event for video jobs in the same format as existing modalities.

## Non-Goals (Out of Scope)

- Video upscale (`upscale → video`) — deferred; no silent success stubs for it.
- Audio inference (`txt2audio`) — out of scope for this iteration.
- Persistent job store — jobs remain in-memory.
- Output formats other than MP4 (WebM, GIF, etc.).
- Streaming / chunked video delivery — the full artifact is delivered after job completion.
- Retries or callback delivery guarantees beyond the current fire-and-forget pattern.

## Open Questions

- None
