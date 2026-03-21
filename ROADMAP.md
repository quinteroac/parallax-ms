# Parallax Media Server — Development Roadmap

This roadmap turns the vision and architecture described in [README.md](./README.md) into phased deliverables. The **[API design](./README.md#api-design)** section defines the target surface: **model discovery** by type (Images, Video, Editing, Audio, Upscalers) and **inference** modalities (`txt2img`, `txt2vid`, `img2img`, `img2vid`, `txt2audio`, `upscale` for image and video). A phase is **done** when every item under “Phase completion criteria” is implemented and verified. Check off items by changing `- [ ]` to `- [x]` as you complete them.

---

> **Stack is fixed.** Every technology named in this roadmap and in [README.md](./README.md) — Bun, Elysia, uv, FastAPI, Uvicorn, dotenvx, p-queue, comfy-diffusion, and all others — is a firm decision, not a suggestion. No technology may be swapped, dropped, or substituted without an explicit revision to this document and README. Implementing an "equivalent" is not acceptable unless this file is updated first to reflect the change and the rationale.

---

## Phase 1 — Repository foundation and runtimes

**Goal:** A maintainable project skeleton where the Node gateway and Python worker can be installed, configured, and started independently.

**Phase completion criteria**

- [ ] Monorepo or clear multi-package layout with **Bun** for the gateway and **uv** for the Python worker; documented install and run commands.
- [ ] **dotenvx** (or equivalent documented secret handling) for local configuration; example env templates without real secrets.
- [ ] Gateway process starts and exposes at least one HTTP health or readiness route; worker process starts and exposes a matching health route.
- [ ] README-level stack table reflected in actual dependency choices (Elysia, FastAPI, Uvicorn, etc. as applicable).

---

## Phase 2 — Gateway: jobs, queue, and client-facing API (stub worker)

**Goal:** The full asynchronous job lifecycle on the gateway with a **stub** worker so behavior can be tested without GPU inference.

**Phase completion criteria**

- [ ] `POST` (or documented equivalent) to create a job: gateway assigns a **`jobId`**, stores state in an **in-memory map**, returns `{ jobId }` immediately (no blocking on inference).
- [ ] **p-queue** (or documented replacement) with **concurrency 1** enqueues work that forwards the serialized job to the worker.
- [ ] **`GET /v1/job/:id`** returns consistent job status and placeholder or final payload fields as designed.
- [ ] **SSE** channel per `jobId` (or documented multiplexing) so clients can wait for completion without polling only.
- [ ] Worker exposes **`POST /infer`**, responds with **202 Accepted**, runs work in a **background task**; for this phase, inference may be a stub that writes a fake result and triggers the callback.
- [ ] **Completion callback:** worker **`POST`s** to gateway **`/worker/done`** (or equivalent) with `{ id, url }`; gateway updates the job map and emits the SSE event.
- [ ] Optional but recommended for “done”: **Portless** (or documented alternative) for stable local HTTPS URLs during development.

---

## Phase 3 — Worker: comfy-diffusion integration and on-disk artifacts

**Goal:** Replace stubs with real inference using **comfy-diffusion**, with outputs written to disk and URLs wired through the callback.

**Phase completion criteria**

- [ ] **`POST /infer`** body validated (e.g. **Pydantic**); job type and parameters map to a real inference path.
- [ ] **Model manager** loads the correct model(s) for each job; failed loads surface as clear job errors and gateway-visible status.
- [ ] Inference runs asynchronously after **202**; result files are written to a defined directory; **`url`** in the callback points to a served asset (gateway static route, worker static route, or documented proxy—choose one and document it).
- [ ] Basic **error propagation**: worker failures update job state and notify the client via SSE + `GET /v1/job/:id` (no silent hangs).

---

## Phase 4 — Model discovery and public API contract

**Goal:** Expose **model discovery** aligned with the README (by type: **Images**, **Video**, **Editing**, **Audio**, **Upscalers**) and lock the **versioned** client contract, job semantics, and documentation before scaling out inference modalities.

**Phase completion criteria**

- [ ] **Discovery:** HTTP API (under **`/v1/...`** or documented equivalent) returns installed models **grouped by** the types above; empty types and errors are explicit and documented.
- [ ] Versioned routes for creating jobs and retrieving results; request/response shapes documented (**OpenAPI** or equivalent).
- [ ] Consistent semantics for **pending / running / succeeded / failed** across memory store, SSE, and JSON responses.
- [ ] Idempotency or duplicate-submission behavior documented (even if “not idempotent” is explicit).
- [ ] **README** / **AGENTS.md** updated so the public contract and discovery behavior match implementation.

---

## Phase 5 — Inference: image (`txt2img`, `img2img`, `upscale` — image)

**Goal:** Deliver the **image** inference flows from [API design](./README.md#api-design) through the same job + callback + SSE path, including **image** upscale.

**Phase completion criteria**

- [ ] **`txt2img`** and **`img2img`** jobs: validated payloads, capability errors when models or inputs are missing.
- [ ] **`upscale` → `image`**: end-to-end path enqueue → infer → artifact on disk → callback **`url`** → SSE → **`GET /v1/job/:id`**.
- [ ] **Editing**-related pipelines that map to image work in this phase (e.g. inpaint / edit) are either implemented here or explicitly deferred with documented errors—no ambiguous “success” stubs.

---

## Phase 6 — Inference: video (`txt2vid`, `img2vid`, `upscale` — video)

**Goal:** Extend the unified pattern to **video** without breaking Phase 4–5 clients.

**Phase completion criteria**

- [ ] **`txt2vid`** and **`img2vid`**: validated payloads; clear errors when video stacks or codecs are unsupported.
- [ ] **`txt2vid`** and **`img2vid`** **LTX2 Architecture** : LTX2 is able to generate videos with sound, then pipeline is not the same as generic video.
- [ ] **`txt2vid`** and **`img2vid`** **WAN 2.2 Architecture**: WAN 2.2 has an architecture of two models high_model for general composition and low_model for details, inferences is diferent.
- [ ] **`upscale` → `video`**: full job path to a retrievable **`url`** and consistent job status.
- [ ] Documentation lists supported containers/codecs, limits (duration, resolution), and failure modes.

---

## Phase 7 — Inference: audio (`txt2audio`) and residual modalities

**Goal:** Complete remaining **inference** items from the API design: **`txt2audio`**, and any **Editing** / **Upscalers** behaviors not covered in Phase 5–6 (if still in scope).

**Phase completion criteria**

- [ ] **`txt2audio`**: end-to-end job path with documented output format(s) and limits.
- [ ] **Upscalers** and **Editing** entries in discovery match what the worker can actually run; unsupported combinations return documented errors (not silent fallback).
- [ ] README **API design** checklist updated: every listed modality is either shipped or explicitly marked out-of-scope with a pointer to issues or docs.

---

## Phase 8 — Memory pressure, deployment, and operations

**Goal:** Behavior aligned with README for **local VRAM** use and **cloud** deployment stories (RunPod, Vast AI, etc.).

**Phase completion criteria**

- [ ] **LRU (or documented) model eviction** under memory pressure so the worker remains stable when model set exceeds VRAM.
- [ ] Configuration for **worker base URL** (and any auth between gateway and worker) so the same client contract works when the worker is remote; document **only base URL changes** for clients where true.
- [ ] Runbook-style notes: local two-process setup vs. split gateway/worker hosts; minimum env vars for each.
- [ ] Optional stretch (not required to close Phase 8 unless you adopt them as goals): persistent job store instead of pure in-memory maps, retries for callback delivery, basic metrics/logging for queue depth and inference duration.

---

## How to use this roadmap

- Treat each phase as a **vertical slice** where possible: prefer completing gateway + worker + docs together over half-finishing multiple phases.
- **Phase 4** should land before treating Phases 5–7 as “stable”—discovery and versioning reduce churn for integrators.
- After Phase 4, prefer **backward-compatible** API changes when adding modalities in Phases 5–7.
- Phases 5–7 can be **reordered or parallelized** by team capacity (e.g. ship audio before video) as long as discovery and job contracts from Phase 4 stay stable; update this document if you swap order.
- Phases 7 and **8** can overlap once core inference paths exist—operations work does not need to wait for every modality.
