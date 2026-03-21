# Audit — Iteration 000003

## Executive Summary

All 7 user stories for iteration 000003 were functionally implemented. The full `txt2img` pipeline, error propagation, playground, and automated E2E test were all in place. Two compliance gaps were identified and subsequently resolved as part of this audit:

1. **FR-6** — The PRD required the *gateway* to serve output images at `<GATEWAY_BASE_URL>/outputs/{job_id}.png`. The implementation instead had the *worker* serving them at `<WORKER_PUBLIC_URL>/assets/{job_id}.png`, exposing the worker's address to clients and breaking the single-entry-point architecture.
2. **FR-5** — The `OUTPUT_DIR` default was `/tmp/parallax-output` instead of `./outputs` as specified.

Both gaps were remediated in the same session. The iteration now fully complies with all FRs and USs.

---

## Verification by FR

| FR | Assessment | Notes |
|----|-----------|-------|
| FR-1 | comply | `InferRequest` Pydantic model has all 10 required fields with correct types and defaults. |
| FR-2 | comply | `startup.py` calls `check_runtime()` in `bootstrap()`; exits non-zero on error. |
| FR-3 | comply | `MODELS_DIR` and `CHECKPOINT_FILENAME` read from env; missing values → `sys.exit(1)`. |
| FR-4 | comply | `tasks.py` implements full pipeline sequence with correct parameter passing. |
| FR-5 | comply | `OUTPUT_DIR` configurable via env; default corrected to `./outputs`. |
| FR-6 | comply | Gateway now serves output images at `GET /outputs/:filename` via `outputsRoutes`; URL in callback uses `GATEWAY_CALLBACK_URL/outputs/{id}.png`. |
| FR-7 | comply | Exception → error callback with nested try/except preventing silent hangs. |
| FR-8 | comply | `/worker/done` accepts optional `error` field; sets job status to `"failed"` and emits SSE. |
| FR-9 | comply | Playground at `GET /playground` with all required form fields and SSE client logic. |
| FR-10 | comply | `worker/.env.example` documents all required env vars with descriptive comments. |

---

## Verification by US

| US | Assessment | Notes |
|----|-----------|-------|
| US-001 | comply | `InferRequest` model; missing `id`/`prompt` → 422; valid request → 202. |
| US-002 | comply | `bootstrap()` in lifespan: `check_runtime()`, `ModelManager`, `load_checkpoint`, health returns 200 only when ready. |
| US-003 | comply | Full pipeline runs in background task; PNG saved to `OUTPUT_DIR/{job_id}.png`. |
| US-004 | comply | Gateway serves images at `/outputs/:filename`; callback URL is `GATEWAY_BASE_URL/outputs/{id}.png`; `GET /v1/job/:id` returns `{status:"succeeded", url:"..."}`. |
| US-005 | comply | Exception → error callback → gateway sets `"failed"` → SSE event → `GET /v1/job/:id` returns `{status:"failed", error:"..."}`. |
| US-006 | comply | Playground served at `GET /playground` with form, SSE subscription, loading indicator, image display, and error display. |
| US-007 | comply | `worker/tests/test_us007.py` — submits POST /infer, asserts PNG on disk, asserts callback URL; skipped without model env vars. |

---

## Minor Observations

- The `/worker/done` handler does not explicitly reject payloads where both `url` and `error` are present simultaneously (harmless — `hasError` takes precedence, but could be more explicit).
- The playground HTML has no input length limits or CSRF protection, acceptable for a developer-only tool.
- The SSE route returns a 404 JSON body with `text/event-stream` content-type headers when the job is not found, which may confuse strict SSE clients.

---

## Conclusions and Recommendations

The iteration is fully compliant after the two remediations applied during this audit:

1. **Gateway now owns image serving** — `gateway/src/routes/outputs.ts` was added with `GET /outputs/:filename`, registered in `gateway/src/index.ts`. Clients communicate with a single entry point for all operations.
2. **URL construction corrected** — `tasks.py` now builds the image URL as `{GATEWAY_CALLBACK_URL}/outputs/{id}.png`, removing the `WORKER_PUBLIC_URL` dependency from the hot path.
3. **OUTPUT_DIR default aligned** — both `main.py` and `tasks.py` now default to `./outputs` as specified in FR-5.
4. **Worker `/assets` route removed** — the worker no longer exposes image serving, keeping its surface area minimal.

The three minor observations above are low-priority and do not warrant immediate action; they can be addressed in a future hardening iteration if needed.

---

## Refactor Plan

No further refactoring is required. All changes were minimal, targeted fixes to close the identified compliance gaps without touching unrelated logic.
