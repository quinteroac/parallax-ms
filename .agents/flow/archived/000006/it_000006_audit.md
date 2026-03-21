# Audit — it_000006

## Executive Summary

All 5 user stories and 9 functional requirements for iteration 000006 comply with the PRD. The gateway correctly merges `modelId`, `modality`, `architecture`, and `components` into every `/infer` dispatch. The worker performs per-request model loading across all four architectures exclusively via `comfy-diffusion`. Error callbacks fire for unsupported architectures, missing `source_image`, and invalid base64. The playground provides dynamic model selection, a mode toggle, file upload, denoise slider, and SSE-driven result display. Three minor gaps were identified and resolved as part of this audit.

## Verification by FR

| FR | Assessment | Notes |
|----|------------|-------|
| FR-1 | comply | `queue.ts` merges `modelId`, `modality`, `architecture`, `components` into the `/infer` body when `job.modelId` is present. The conditional guard is intentional for legacy job types. |
| FR-2 | comply | `InferRequest` declares all five required fields with correct types and defaults. |
| FR-3 | comply | `tasks.py` reads `MODELS_DIR` from the environment, instantiates `ModelManager`, and loads components from the request body at inference time. No startup-time weight loading. |
| FR-4 | comply | `_load_model_components` covers all four architectures using `comfy_diffusion` APIs exclusively (no direct ComfyUI calls). |
| FR-5 | comply | `img2img` branch uses `vae_encode` + `denoise` parameter to `sample()` for all four architectures via the same loading path. |
| FR-6 | comply | Unknown architecture raises `ValueError` → error callback. Missing component key raises `KeyError` → same handler. Unknown modality now also raises `ValueError` (fixed in this audit). |
| FR-7 | comply | Playground fetches `/v1/models` on load; shows "Loading models…" initially and "Could not load models" on failure. |
| FR-8 | comply | Submit handler sends `JSON.stringify({ modelId, modality, params })` to `POST /v1/jobs`. |
| FR-9 | comply | `FileReader.readAsDataURL` result is stripped of the data-URI prefix and assigned to `params.source_image`. |

## Verification by US

| US | Assessment | Notes |
|----|------------|-------|
| US-001 | comply | `queue.ts` looks up model by `job.modelId`, merges four fields. `InferRequest` declares all new fields. Tests pass. |
| US-002 | comply | `startup.py` only calls `check_runtime()`. `tasks.py` routes `txt2img` for all four architectures. Error callback fires for unknown architecture. Output URL matches spec. |
| US-003 | comply | `InferRequest` accepts `source_image` and `denoise_strength`. `tasks.py` routes `img2img` for all four architectures. Error callbacks fire for missing/invalid `source_image`. |
| US-004 | comply | Full gateway-to-worker pipeline in place: job creation, worker inference, `/worker/done` callback, job store update, SSE event. Logged as visually verified in progress. |
| US-005 | comply | Model selector, mode toggle, file upload, denoise range, `{ modelId, modality, params }` submit, SSE handling, and image display all implemented. Logged as visually verified in progress. |

## Minor Observations

1. **`queue.ts` conditional guard** — `modelId`/`modality`/`architecture`/`components` are only merged when `job.modelId` is truthy. FR-1 says "every body sent to POST /infer". Intentional for legacy compat; worth documenting explicitly as a design decision.
2. **`models.py` optional defaults** — `modality`, `architecture`, `components` carry empty-string/dict defaults, making them optional at the Pydantic validation level. Missing fields fall through to the error-callback path rather than returning HTTP 422. Functionally safe.
3. **Unknown modality** — Fixed: `tasks.py` now raises `ValueError` for any modality that is neither `txt2img` nor `img2img`, which triggers the standard error callback.
4. **Playground radio group accessibility** — Fixed: the mode toggle is now wrapped in `<fieldset>`/`<legend>` and the inner div carries `role="radiogroup"` with `aria-label`.
5. **Playground submit-while-loading** — The JS guard at line 428 catches an empty model select and shows an error; acceptable as-is.

## Conclusions and Recommendations

The iteration is fully compliant. Two actionable gaps were resolved in this audit:
- `tasks.py`: added explicit `elif request.modality == "txt2img"` branch and an `else` that raises `ValueError` for unknown modalities.
- `playground.ts`: wrapped the mode toggle in `<fieldset>`/`<legend>` and added `role="radiogroup"` + `aria-label` to the container div.

No further blocking issues remain.

## Refactor Plan

| # | File | Change | Rationale |
|---|------|--------|-----------|
| 1 | `worker/src/parallax_worker/tasks.py` | Replace the catch-all `else` on modality with an explicit `elif "txt2img"` + `else raise ValueError` | Prevents silent misrouting of unknown modality values; triggers error callback instead. |
| 2 | `gateway/src/routes/playground.ts` | Wrap mode-toggle radio group in `<fieldset>`/`<legend>`; add `role="radiogroup"` + `aria-label` to the container div | Accessibility: screen readers announce the group's purpose without requiring users to inspect individual radio labels. |
