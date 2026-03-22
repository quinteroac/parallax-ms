# Audit Report — Iteration 000008

## Executive Summary

Iteration 000008 delivers txt2vid and img2vid inference end-to-end with high overall compliance. All 5 user stories are substantially implemented: model discovery returns video models, the gateway accepts and validates video jobs, the worker runs both pipelines exclusively via comfy_diffusion, artifacts are served as MP4 over HTTP, and the playground UI supports full video mode. Two gaps were identified and subsequently fixed: (1) the gateway was not validating `width`/`height`/`duration` for invalid values, and (2) the worker had no explicit check that comfy_diffusion produced a valid MP4 file.

---

## Verification by FR

| FR | Assessment | Notes |
|---|---|---|
| FR-1 | comply | `models.config.json` includes `wan-video-t2v-14b` (txt2vid) and `wan-video-i2v-14b` (img2vid). `loadModels()` and `findModelById()` iterate all model types including video. `GET /v1/models` returns both entries with correct fields. |
| FR-2 | comply | Fixed: gateway now validates `width`/`height` as positive integers and `duration` as a positive number, returning `400` for invalid values. |
| FR-3 | comply | Gateway folds `inputImage` → `source_image` in params for img2vid. All of `width`, `height`, `duration`, `source_image` are forwarded to worker. |
| FR-4 | comply | Worker `InferRequest` includes `width: int`, `height: int`, `duration: float = Field(gt=0.0)`, `source_image: str | None`, and `modality` literal with `txt2vid`/`img2vid`. |
| FR-5 | comply | Both video branches use only `comfy_diffusion` imports. No fallback to other inference libraries. |
| FR-6 | comply | Fixed: after `save_video()`, worker now verifies the output file exists and has a `.mp4` suffix; raises `RuntimeError` otherwise, triggering the error-callback path. |
| FR-7 | comply | `GET /outputs/:filename` serves MP4 with `content-type: video/mp4`. Callback URL uses `{callback_base}/outputs/{request.id}.mp4`. |
| FR-8 | comply | SSE emitter is modality-agnostic; video jobs emit the same `{id, status, url?, error?}` terminal event format. |

---

## Verification by US

| US | Assessment | Notes |
|---|---|---|
| US-001 | comply | All 4 ACs satisfied: config has both video modalities, `GET /v1/models` returns them with correct fields, `GET /v1/models/:id` resolves each, typecheck passes. |
| US-002 | comply | All 6 ACs satisfied after fix: valid txt2vid/img2vid jobs return 201; width/height/duration accepted and validated; non-video model returns 400; missing inputImage returns 400; typecheck passes. |
| US-003 | comply | All 8 ACs satisfied: async 202, comfy_diffusion only, MP4 on disk, callback with url, succeeded state + SSE, GET returns url, errors propagate to failed. |
| US-004 | comply | All 8 ACs satisfied: same as US-003 plus inputImage/source_image handling for img2vid. |
| US-005 | comply | ACs 01–05 and 07 verified by code. AC06 (visual browser verification) is outside static audit scope but playground code is structurally correct. |

---

## Minor Observations

- US-005-AC06 requires visual browser verification. The playground code is structurally correct (video element, show/hide on `.mp4` URL, `controls` attribute) but browser-level QA is outside static audit scope.
- `outputs.ts` content-type detection is extension-only (`.mp4` → `video/mp4`, otherwise `image/png`). Other artifact types added in future would need this updated.
- `video_fps` defaults to 16 fps but is not surfaced as a user-configurable parameter in the playground or gateway API.
- The playground sends source images as base64 data URIs with no client-side size validation; large images could cause slow submissions or payload size rejections.
- `playground.ts` is 600+ lines. As video mode adds complexity, future iterations should consider modularising it.

---

## Conclusions and Recommendations

Both compliance gaps have been resolved in this iteration:

1. **FR-2 (gateway/src/routes/jobs.ts)**: Added validation block for `txt2vid`/`img2vid` jobs that rejects non-positive `width`, non-positive `height`, and non-positive `duration` with `400` and a descriptive error message.
2. **FR-6 (worker/src/parallax_worker/tasks.py)**: Added post-`save_video()` checks in both the `img2vid` and `txt2vid` branches that verify the output file exists and ends with `.mp4`; a `RuntimeError` is raised otherwise, which is caught by the existing error handler and propagated as a `failed` job with an error message.

All FRs and USs now comply. The minor observations above are low-priority but should be tracked for future iterations.

---

## Refactor Plan

No structural refactoring required. The fixes were minimal, targeted, and consistent with the existing code patterns:

- `jobs.ts`: One new validation block (~20 lines) inserted after the existing `img2vid` inputImage check, following the same guard-clause pattern used throughout the handler.
- `tasks.py`: Two identical 3-line post-write checks inserted after each `save_video()` call in the `img2vid` and `txt2vid` branches.

Future work to consider (not urgent):
- Extract video parameter validation in `jobs.ts` into a shared helper if more video modalities are added.
- Surface `video_fps` as a client-configurable parameter (playground + gateway + worker).
- Break `playground.ts` into smaller modules or migrate to a frontend framework.
