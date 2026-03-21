# Requirement: Image Upscaling (`upscale` modality)

## Context

Phase 5 of the roadmap requires image upscaling as the third inference modality alongside `txt2img` and `img2img`. Currently, `models.config.json` has no upscaler entries, the worker only handles `txt2img` and `img2img`, the gateway does not accept `modality: "upscale"`, and the playground has no upscale mode. This iteration completes Phase 5 by delivering the full upscale job path — model config → gateway validation → worker inference → artifact on disk → callback → SSE → playground UI.

## Goals

- Deliver end-to-end `upscale` inference through the existing job + callback + SSE pipeline.
- Add at least one upscaler model to `models.config.json` so discovery and validation work without custom configuration.
- Extend the playground to let users submit upscale jobs and see results in the browser.

## User Stories

Each story is small enough to implement in one focused session.

---

### US-001: Model config includes an upscaler entry

**As a** client, **I want** `GET /v1/models` to return at least one model with `type: "upscalers"` and `modality: "upscale"` **so that** I can discover available upscalers before submitting a job.

**Acceptance Criteria:**
- [ ] `models.config.json` contains at least one entry with `"type": "upscalers"` and `"modalities"` including `"upscale"`.
- [ ] `GET /v1/models` response groups that entry under the `"upscalers"` key.
- [ ] `GET /v1/models/:id` returns the upscaler entry correctly.
- [ ] Typecheck / lint passes.

---

### US-002: Gateway accepts and validates upscale jobs

**As a** client, **I want** `POST /v1/jobs` to accept `{ modelId, modality: "upscale", params: { source_image } }` **so that** I can submit upscale jobs through the standard job API.

**Acceptance Criteria:**
- [ ] `POST /v1/jobs` with `modality: "upscale"` and a valid upscaler `modelId` returns `201` with `{ jobId }`.
- [ ] If the selected model does not support `"upscale"` in its `modalities`, the gateway returns `400` with a clear error message.
- [ ] If `source_image` is missing from `params`, the gateway returns `400` with a clear error message.
- [ ] `architecture` and `components` from the model config are forwarded to the worker `POST /infer` body, along with `modality: "upscale"` and `source_image`.
- [ ] Typecheck / lint passes.

---

### US-003: Worker runs upscale inference end-to-end

**As a** system, **I want** the worker to execute real upscale inference via `comfy_diffusion` for an `upscale` modality request **so that** a higher-resolution output is written to disk and the gateway is notified via callback.

**Acceptance Criteria:**
- [ ] Worker `POST /infer` with `modality: "upscale"` and a valid base64 `source_image` responds `202 Accepted` and starts inference in a background task.
- [ ] Inference calls the appropriate `comfy_diffusion` upscale API (e.g. `upscale_image`) with the decoded source image and the loaded upscaler model.
- [ ] Output image is written to `OUTPUT_DIR/<jobId>.png`.
- [ ] On success, worker POSTs `{ id, url }` to `GATEWAY_CALLBACK_URL/worker/done`; gateway updates job to `succeeded` and SSE fires.
- [ ] On failure (invalid image, unsupported model, inference error), worker POSTs `{ id, error }` to the callback; gateway updates job to `failed` and SSE fires.
- [ ] `InferRequest` Pydantic model accepts `source_image` (required for `upscale`).
- [ ] Typecheck / lint passes.

---

### US-004: Playground supports upscale mode

**As a** user, **I want** the playground to include an "upscale" mode toggle option **so that** I can submit an upscale job, watch it complete via SSE, and see the result image — all without leaving the browser.

**Acceptance Criteria:**
- [ ] Mode toggle adds a third option: `txt2img | img2img | upscale`.
- [ ] When `upscale` is selected: source image file input is shown; prompt, negative prompt, width, height, steps, CFG, seed, and denoise strength fields are hidden.
- [ ] When `upscale` is selected, the model selector filters to show only models whose `modalities` include `"upscale"` (or shows all if filtering is not feasible, with an explanatory note).
- [ ] Submitting an upscale job POSTs `{ modelId, modality: "upscale", params: { source_image } }` to `POST /v1/jobs`.
- [ ] On job completion, the result image is displayed in the browser.
- [ ] On job failure, the error message is displayed.
- [ ] Visually verified in browser: upscale mode renders correctly, result image appears after successful job.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** `models.config.json` schema (`ModelConfigSchema`) must accept `"upscale"` as a valid modality value; no schema changes should break existing `txt2img`/`img2img` entries.
- **FR-2:** Gateway job-creation validation must reject `modality: "upscale"` when the selected model's `modalities` array does not include `"upscale"`.
- **FR-3:** Gateway job-creation validation must require `params.source_image` (non-empty string) when `modality` is `"upscale"`; return `400` otherwise.
- **FR-4:** The worker `InferRequest` Pydantic model must accept `modality: "upscale"` without throwing a validation error.
- **FR-5:** Worker `run_inference` must branch on `modality == "upscale"`, decode `source_image`, call the `comfy_diffusion` upscale API, save the output, and POST the callback — mirroring the existing `txt2img`/`img2img` error-propagation pattern.
- **FR-6:** Only models with `"upscale"` in their `modalities` list may be forwarded to the worker with `modality: "upscale"`; mismatch is caught at gateway layer before any queue dispatch.
- **FR-7:** Automated tests in `gateway/test/` must cover the upscale happy path and the two new `400` validation error cases (model does not support upscale; missing `source_image`).

## Non-Goals (Out of Scope)

- Video upscaling (`upscale` for video) — deferred to Phase 6.
- Configurable scale factor as an explicit API parameter — the scale factor is determined by the upscaler model itself.
- Persistent job storage — remains in-memory as in all prior iterations.
- VRAM / memory pressure management — deferred to Phase 8.
- Adding multiple upscaler models — one entry in `models.config.json` is sufficient for this iteration.

## Open Questions

None — the upscale implementation API has been fully resolved by inspecting the installed package source. See FR-8 through FR-11 below for the concrete implementation contract.

## Resolved: Upscale Implementation Contract

The following was determined by inspecting the `comfy_diffusion` and `spandrel` source at
`worker/.venv/lib/python3.12/site-packages/`.

### Loading an upscaler model

As of `comfy_diffusion` **1.2.0**, `ModelManager` exposes `load_upscale_model`:

```python
from comfy_diffusion.models import ModelManager

manager = ModelManager(models_dir)
upscale_model = manager.load_upscale_model(components["upscale_model"])
```

Pass a filename (relative) — resolved under `models_dir/upscale_models/` — or an absolute path. Supported extensions: `.safetensors`, `.pt`, `.pth`, `.ckpt`. Raises `TypeError` if the model is not a `spandrel.ImageModelDescriptor`; raises `FileNotFoundError` if the file cannot be resolved.

### Running upscale inference

```python
from comfy_diffusion.image import image_upscale_with_model, image_to_tensor

# pil_image: PIL.Image decoded from base64 source_image
image_tensor = image_to_tensor(pil_image)            # → BHWC float32, shape (1, H, W, 3)
upscaled_tensor = image_upscale_with_model(upscale_model, image_tensor)
```

### Converting output tensor → PIL Image for saving

```python
import numpy as np
from PIL import Image as PILImage

# upscaled_tensor shape: (1, H', W', 3), dtype: float32, range: [0.0, 1.0]
arr = np.clip(255.0 * upscaled_tensor[0].cpu().numpy(), 0, 255).astype(np.uint8)
result_image = PILImage.fromarray(arr, mode="RGB")
result_image.save(str(output_path))
```

### Additional functional requirements from this resolution

- **FR-8:** Upscaler model entries in `models.config.json` must include an `"upscale_model"` key in `components` (filename under `models_dir/upscale_models/`); this replaces the `"checkpoint"` / `"diffusion_model"` convention used by image generation models.
- **FR-9:** Worker must load the upscaler via `manager.load_upscale_model(components["upscale_model"])` (`comfy_diffusion` 1.2.0+); raises `TypeError` if not a valid `ImageModelDescriptor`, `FileNotFoundError` if the file is missing — both must propagate as job failures via the error callback.
- **FR-10:** Worker must call `image_to_tensor(pil_image)` (from `comfy_diffusion.image`) to convert the decoded PIL source image to the BHWC float32 tensor expected by `image_upscale_with_model`.
- **FR-11:** Output must be converted back to PIL via `PILImage.fromarray(np.clip(255.0 * tensor[0].cpu().numpy(), 0, 255).astype(np.uint8), mode="RGB")` before saving to disk.
