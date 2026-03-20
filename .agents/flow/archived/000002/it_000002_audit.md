# Audit Report — Iteration 000002

## Executive Summary

Iteration 000002 is fully compliant with the PRD after applying two targeted fixes. All eight user stories and all eight functional requirements now comply. The full job lifecycle (pending → running → succeeded/failed) is operational across the gateway (Bun/Elysia) and stub worker (FastAPI), with p-queue concurrency control, SSE streaming, in-memory job store, automated test suites, and smoke-test documentation all in place. Two gaps identified during the audit were remediated: (1) the worker's simulated delay is now configurable via the `INFER_DELAY_SECONDS` environment variable; (2) README markdown bold formatting around "not" was removed so test assertions match the raw text, resolving 3 previously failing tests (51 gateway + 26 worker all green).

## Verification by FR

| FR | Assessment | Notes |
|----|-----------|-------|
| FR-1 | comply | All four gateway endpoints present: `POST /v1/jobs`, `GET /v1/jobs/:id`, `GET /v1/jobs/:id/events`, `POST /worker/done`. |
| FR-2 | comply | Four states (`pending`, `running`, `succeeded`, `failed`) defined in `job-store.ts`. Transitions are one-way. |
| FR-3 | comply | In-memory `Map<string, Job>` store in `gateway/src/job-store.ts:17`. No external database. |
| FR-4 | comply | `new PQueue({ concurrency: 1 })` at module scope in `gateway/src/queue.ts:6`, shared across process lifetime. |
| FR-5 | comply | Worker reads `GATEWAY_CALLBACK_URL` from env with default `http://localhost:3000` (`tasks.py:19`). |
| FR-6 | comply | Gateway reads `WORKER_BASE_URL` from env with default `http://localhost:8000` (`queue.ts:9`). |
| FR-7 | comply | Worker delay now reads `INFER_DELAY_SECONDS` from env (`int(os.getenv("INFER_DELAY_SECONDS", "2"))`), default 2 s. |
| FR-8 | comply | SSE stream closes after terminal event (`routes/jobs.ts:32`). Client disconnect handled via `ReadableStream` cancel callback (`routes/jobs.ts:51-53`). |

## Verification by US

| US | Assessment | Notes |
|----|-----------|-------|
| US-001 | comply | `POST /v1/jobs` accepts `{type, params}`, assigns UUID, stores pending state, returns `201 {jobId}`, returns `400` on bad body. All 5 ACs pass. |
| US-002 | comply | p-queue concurrency:1 enforced; gateway POSTs `{id, type, params}` to `/infer`; `202 → running` transition; unreachable worker → `failed`. All 5 ACs pass. |
| US-003 | comply | `GET /v1/jobs/:id` returns `{id, status, createdAt, updatedAt}`, conditionally includes `url` (success) and `error` (failure), `404` for unknown. All 5 ACs pass. |
| US-004 | comply | SSE endpoint opens `text/event-stream`, emits terminal events, closes immediately after, handles late-connecting clients, `404` for unknown. All 6 ACs pass. |
| US-005 | comply | `POST /infer` validates via Pydantic `InferRequest`, returns `202` immediately, background task delays then POSTs to gateway, errors caught without crashing, `GET /health` returns `200` during background work. All 6 ACs pass. |
| US-006 | comply | `POST /worker/done` accepts `{id, url}`, updates job to `succeeded`, emits SSE, `404` for unknown. All 5 ACs pass. |
| US-007 | comply | `docs/smoke-test.md` provides step-by-step instructions with expected outputs and lifecycle table. Both ACs pass. |
| US-008 | comply | All tests pass: 51 gateway (`bun test`) + 26 worker (`uv run pytest`). All 5 ACs pass after README and delay fixes. |

## Minor Observations

- Worker asset URL is hardcoded as `http://localhost/assets/<id>.png` in `tasks.py:18`. Acceptable for the stub phase; Phase 3 should replace with real asset storage and a configurable base URL.
- `GATEWAY_PUBLIC_URL` and `INTERNAL_CALLBACK_SECRET` are referenced in `gateway/.env.example` as "later phase" variables. Not yet implemented, as expected.

## Conclusions and Recommendations

The iteration is complete and fully compliant. No further changes are required for this phase. Two items are recommended as future work:

1. **Phase 3** — Replace the hardcoded asset URL placeholder in `tasks.py` with a configurable `ASSET_BASE_URL` environment variable once real inference and storage are wired in.
2. **Phase 3** — Implement `GATEWAY_PUBLIC_URL` and `INTERNAL_CALLBACK_SECRET` when deploying the gateway in a non-localhost environment.

## Refactor Plan

No structural refactoring is required. The codebase is clean, well-typed, and covered by tests. The only changes applied were:

1. `worker/src/parallax_worker/tasks.py` — Read `INFER_DELAY_SECONDS` from env: `int(os.getenv("INFER_DELAY_SECONDS", "2"))`.
2. `README.md` lines 16 and 18 — Removed markdown bold (`**not**` → `not`) so test substring assertions match the raw text.
