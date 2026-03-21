# Audit — Iteration 000007

## Executive Summary

Iteration 000007 delivers complete end-to-end upscale support across all system layers. The `models.config.json` includes a valid upscaler entry (4x-UltraSharp), the gateway validates upscale jobs and rejects invalid requests with proper 400 errors, the worker branches on `modality='upscale'` and correctly calls the comfy_diffusion upscale API with full callback propagation, and the playground exposes a functional upscale mode with field toggling, model filtering, and result display. All functional requirements are satisfied and test coverage spans the happy path and both new 400 validation scenarios. No compliance gaps were found.

## Verification by FR

| FR | Assessment | Notes |
|----|------------|-------|
| FR-1 | comply | `ModelConfigSchema` adds `"upscalers"` to `VALID_TYPES`; modalities array accepts `"upscale"` without breaking existing entries. |
| FR-2 | comply | `jobs.ts` returns 400 when `model.modalities` does not include the requested modality. |
| FR-3 | comply | `jobs.ts` returns 400 with a clear error when `source_image` is absent or falsy for `modality: "upscale"`. |
| FR-4 | comply | `InferRequest.modality` now typed `Literal["txt2img","img2img","upscale"]`; `source_image: str | None = None` accepted. |
| FR-5 | comply | `tasks.py` branches on `modality == "upscale"`, decodes image via `_decode_source_image()`, calls `image_upscale_with_model()`, saves to `OUTPUT_DIR/<jobId>.png`, posts success/error callback. |
| FR-6 | comply | Modality validation fires before queue dispatch; mismatched models are rejected at the gateway layer. |
| FR-7 | comply | `jobs-create.test.ts` covers happy path (201), model-doesn't-support-upscale (400), and missing `source_image` (400). |

## Verification by US

| US | Assessment | Notes |
|----|------------|-------|
| US-001 | comply | `models.config.json` has `4x-UltraSharp` with `type:"upscalers"` and `modalities:["upscale"]`. `GET /v1/models` groups it under `"upscalers"`. `GET /v1/models/:id` retrieves it correctly. |
| US-002 | comply | `POST /v1/jobs` accepts valid upscale jobs (201), rejects unsupported modality (400), rejects missing `source_image` (400). `architecture`, `components`, `modality`, and `source_image` forwarded to worker via queue dispatcher. |
| US-003 | comply | Worker `POST /infer` with `modality:"upscale"` returns 202, runs inference in background, writes to `OUTPUT_DIR/<jobId>.png`, posts success or error callback. |
| US-004 | comply | Playground adds `upscale` to mode toggle; upscale mode shows source image input and hides generation fields; model selector filters to upscale-capable models; submission sends correct payload; result/error displayed. |

## Minor Observations

1. `InferRequest.modality` was typed as `str` — added `Literal["txt2img","img2img","upscale"]` to harden the Pydantic contract (addressed in this audit).
2. Playground showed only a disabled option when no upscale models were available — added a visible `<small>` hint element with an explanatory note (addressed in this audit).
3. `_decode_source_image()` surfaced raw Python exception strings in error callbacks — replaced with human-readable, actionable messages (addressed in this audit).

## Conclusions and Recommendations

Iteration 000007 is fully compliant with the PRD. All minor observations from the compliance report have been resolved: the worker model contract is now strictly typed, the playground communicates clearly when no upscale models are configured, and decode error messages are user-friendly. The implementation is production-ready.

## Refactor Plan

All three items from minor observations were applied in-place during the audit:

1. **`worker/src/parallax_worker/models.py`** — Changed `modality: str = ""` to `modality: Literal["txt2img", "img2img", "upscale"] = "txt2img"` with `from typing import Literal` import.
2. **`gateway/src/routes/playground.ts`** — Added `<small id="model-hint">` element below the model `<select>` and wired it in `populateModelSelect()` to display only when upscale mode is active and no upscale models are available.
3. **`worker/src/parallax_worker/tasks.py`** — Replaced generic `f"source_image is not valid base64: {exc}"` and `f"source_image could not be decoded as a valid image: {exc}"` messages with static, actionable strings that do not leak raw exception details.
