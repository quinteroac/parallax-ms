# Requirement: Audio Inference — txt2audio (Phase 7)

## Context

Parallax Media Server already supports image (`txt2img`, `img2img`, `upscale`) and video (`txt2vid`, `img2vid`) inference. Phase 7 of the roadmap extends the unified job → worker → artifact → callback → SSE pipeline to **audio** generation, enabling clients to generate WAV audio files from text prompts using the ACE Step 1.5 model via `comfy_diffusion`.

## Goals

- Deliver `txt2audio` inference end-to-end through the existing gateway → worker → artifact → callback → SSE path.
- Expose audio models in the model discovery API with type `audio` and modality `txt2audio`.
- Allow clients to control audio duration, BPM, and other generation parameters via job parameters.
- Surface all failures clearly — no silent hangs or ambiguous success responses.
- Extend the playground UI to submit audio jobs and play back the resulting WAV.

## User Stories

### US-001: Model discovery returns audio models

**As an** end user, **I want** `GET /v1/models` to return audio models **so that** I can discover which models support `txt2audio` before submitting a job.

**Acceptance Criteria:**
- [ ] `models.config.json` includes at least one model entry with `"type": "audio"` and `"modalities": ["txt2audio"]` using the `ace-step-1.5` architecture.
- [ ] `GET /v1/models` response includes the audio model entry with correct `id`, `name`, `type`, `modalities`, `architecture`, and `components` fields.
- [ ] `GET /v1/models/:id` resolves the audio model by id and returns the full model object.
- [ ] Typecheck / lint passes.

---

### US-002: Gateway accepts and validates txt2audio job creation

**As an** end user, **I want** `POST /v1/jobs` to accept `txt2audio` jobs with audio-specific parameters **so that** I can submit an audio generation request and get a `jobId` back immediately.

**Acceptance Criteria:**
- [ ] A valid request with `modelId` referencing an audio model, `modality: "txt2audio"`, and a non-empty `prompt` returns HTTP 201 with a `jobId`.
- [ ] Submitting a `txt2audio` job with a model whose modalities do not include `txt2audio` returns HTTP 400 with a descriptive error.
- [ ] Submitting a `txt2audio` job with a missing or empty `prompt` returns HTTP 400.
- [ ] Optional audio parameters (`duration`, `bpm`, `lyrics`) are forwarded to the worker inside `params` when present.
- [ ] Typecheck / lint passes.

---

### US-003: Worker runs txt2audio inference and writes WAV artifact

**As an** end user, **I want** the worker to generate a WAV audio file from the job prompt and fire a callback to the gateway **so that** I receive a URL pointing to the audio output.

**Acceptance Criteria:**
- [ ] Worker responds to `POST /infer` with HTTP 202 immediately and runs inference in a background task.
- [ ] Inference uses only `comfy_diffusion` — no other audio library is used for the core generation pipeline.
- [ ] Output artifact is written to the configured `OUTPUT_DIR` as `{job_id}.wav`.
- [ ] After successful inference, worker POSTs to the gateway `/worker/done` callback with `{ id, url }` where `url` points to the WAV file.
- [ ] Gateway serves the artifact at `GET /outputs/{job_id}.wav` with `Content-Type: audio/wav`.
- [ ] On inference failure, worker POSTs to the gateway callback with `{ id, error }` and the job transitions to `failed` state with the error message visible via `GET /v1/jobs/:id`.
- [ ] `GET /v1/jobs/:id` returns `status: "succeeded"` and a `url` field after a successful job completes.
- [ ] Typecheck / lint passes.

---

### US-004: Playground UI supports submitting audio jobs and playing back the result

**As an** end user, **I want** the playground to let me select an audio model, fill in a prompt, submit a `txt2audio` job, and hear the result in the browser **so that** I can test audio generation without writing API calls.

**Acceptance Criteria:**
- [ ] When an audio model is selected in the model dropdown, the playground switches to audio mode, showing a prompt field and optional audio parameters (duration in seconds, BPM).
- [ ] Submitting the form dispatches a `POST /v1/jobs` request with `modality: "txt2audio"` and the audio parameters.
- [ ] The playground listens on the SSE channel for the terminal event and, on success, reveals an `<audio controls>` element pointing to the returned `url`.
- [ ] The `<audio>` element is hidden until a successful result URL is received.
- [ ] Job errors are displayed as a visible error message in the UI.
- [ ] Typecheck / lint passes.
- [ ] Visually verified in browser: model selector switches mode, form submits, audio element plays back the WAV.

---

## Functional Requirements

- FR-1: `models.config.json` must include at least one model entry with `"type": "audio"`, `"modalities": ["txt2audio"]`, and architecture `"ace-step-1.5"`.
- FR-2: Gateway `POST /v1/jobs` must validate `txt2audio` jobs: reject missing/empty `prompt`; reject models whose modalities do not include `txt2audio`; forward `duration`, `bpm`, and `lyrics` from request body into job `params` when present.
- FR-3: Worker `InferRequest` Pydantic model must be extended with audio-specific fields: `bpm: int` (default 120), `lyrics: str` (default ""), and existing `duration: float` already covers audio duration.
- FR-4: A new architecture loader `ace-step-1.5` must be registered in `model_loader._LOADERS`; it calls `manager.load_unet(components["diffusion_model"])`, `manager.load_vae(components["vae"])`, and `manager.load_clip(components["text_encoder"], components["text_encoder2"], clip_type="ace")`; no `clip_vision` is needed.
- FR-5: A new `Txt2AudioHandler` must be added to `handlers/txt2audio.py`, implementing `ModalityHandler.run()` using only `comfy_diffusion.audio` and `comfy_diffusion.sampling` primitives. The pipeline is: (1) `encode_ace_step_15_audio` for positive conditioning, (2) same function with empty tags / `generate_audio_codes=False` for negative, (3) `empty_ace_step_15_latent_audio(seconds=duration)` for the empty latent, (4) `sample(...)`, (5) `vae.decode(denoised["samples"])` to get the waveform tensor at 44 100 Hz, (6) trim the last 5 seconds to remove ACE trailing silence (never trim below 1 second total), (7) `torchaudio.save`.
- FR-6: `Txt2AudioHandler` must save the decoded waveform to `{output_dir}/{job_id}.wav` using `torchaudio.save(str(output_path), waveform, 44100)`; if the file does not exist after save, raise `RuntimeError` to trigger the error-callback path.
- FR-7: `REGISTRY` in `handlers/registry.py` must include `"txt2audio": Txt2AudioHandler()`.
- FR-8: `GET /outputs/:filename` in the gateway must detect `.wav` extension and return `Content-Type: audio/wav`.
- FR-9: The playground must detect audio model type from the models API response and render an `<audio controls>` element (hidden until a result URL is set) alongside the existing image/video result area.

## Non-Goals (Out of Scope)

- `img2audio` or any audio-to-audio modality — only `txt2audio` is in scope for this iteration.
- Streaming audio output — the artifact is delivered as a complete file via the existing callback mechanism.
- Configurable sample rate exposed to end users — the sample rate is determined by the model and saved as-is.
- MP3, FLAC, or any output format other than WAV.
- Audio length / file size limits or quota enforcement.

## Open Questions

None.
