# Parallax Media Server

Parallax Media Server is a media server built on [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) that exposes a unified API for image, video, and other media generation using local and remote inference.

## Motivation

When building apps that need media generation, inference code is often reimplemented in every project. Parallax separates the inference server from client applications so you can run it locally or on cloud GPUs (e.g. RunPod, Vast AI) without changing the API contract.

## Stack

| Area | Technologies |
|------|----------------|
| Languages | Python, Node.js |
| Package / runtime | [Bun](https://bun.sh/), [uv](https://docs.astral.sh/uv/) |
| Node (gateway) — `gateway/package.json` | [Elysia](https://elysiajs.com/) — HTTP server and SSE; [p-queue](https://github.com/sindresorhus/p-queue) — in-memory job queue (concurrency: 1); [dotenvx](https://dotenvx.com/) — `@dotenvx/dotenvx` for encrypted `.env` and secrets in development |
| Optional (gateway, local HTTPS) | [Portless](https://portless.dev/) — stable `.localhost` URLs with HTTPS for local dev; not a Phase 1 package dependency (see [ROADMAP.md](./ROADMAP.md)) |
| Python (worker) — `worker/pyproject.toml` | [FastAPI](https://fastapi.tiangolo.com/) — worker HTTP API; [Uvicorn](https://www.uvicorn.org/) — ASGI server; [Pydantic](https://docs.pydantic.dev/) — request/response validation |
| Inference (later phases) | [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) — inference engine and model management; not in the Phase 1 worker manifest (tracked in [ROADMAP.md](./ROADMAP.md) Phase 3+) |

## Repository layout

This repository is a **monorepo** with two packages:

| Package | Path | Role |
|---------|------|------|
| **Gateway** | [`gateway/`](./gateway/) | Bun + Elysia HTTP API (jobs, SSE, coordination) |
| **Worker** | [`worker/`](./worker/) | uv-managed Python FastAPI inference service |

## Getting started

### Prerequisites

- [Bun](https://bun.sh/) for the gateway
- [uv](https://docs.astral.sh/uv/) for the Python worker
- Python **3.11+** (managed by uv when you sync the worker)

> **Note:** The `dotenvx` CLI used to load `worker/.env` is installed as part of the gateway (`gateway/node_modules/.bin/dotenvx`). Install the gateway first (`cd gateway && bun install`) before running the dotenvx command for the worker.

### Install

**Gateway (Bun)**

```bash
cd gateway && bun install
```

**Worker (uv)**

```bash
cd worker && uv sync
```

### Run

**Phase 1:** No environment variables are **required** for either process to start. The gateway and worker each expose **`GET /health`** for probes — see [Gateway health (HTTP)](#gateway-health-http) and [Worker health (HTTP)](#worker-health-http) below. Optional variables are documented below and in each package’s `.env.example`.

**Gateway**

```bash
cd gateway && bun run dev
```

By default the gateway listens on **port 3000**. Override with the optional `PORT` variable documented in [`gateway/.env.example`](./gateway/.env.example).

#### Gateway health (HTTP)

| Method | Path | Expected response |
|--------|------|-------------------|
| `GET` | `/health` | **200 OK** — JSON body `{ "status": "ok" }` (minimal response suitable for orchestrator and load-balancer probes). |

**Worker**

```bash
cd worker && uv run uvicorn parallax_worker.main:app --host 0.0.0.0 --port 8000 --reload
```

By default the worker listens on **port 8000**. Override `--port` / `--host` as needed, or use the optional `PORT` and `HOST` values documented in [`worker/.env.example`](./worker/.env.example).

#### Worker health (HTTP)

The worker uses the **same liveness contract** as the gateway: when the process is ready to serve, **`GET /health`** returns **200 OK** with JSON `{ "status": "ok" }`. Use it for orchestrator and load-balancer probes independently of the gateway.

| Method | Path | Expected response |
|--------|------|-------------------|
| `GET` | `/health` | **200 OK** — JSON body `{ "status": "ok" }` (same shape as [Gateway health (HTTP)](#gateway-health-http)). |

To load variables from `worker/.env` (after copying from the example file) without adding a separate Python env loader, run **dotenvx** from the **worker** directory so it loads **`worker/.env`** (requires `bun install` in `gateway/` so the CLI exists on disk). A shell is used so optional `HOST` / `PORT` from the file apply to uvicorn:

```bash
cd worker && ../gateway/node_modules/.bin/dotenvx run -- sh -c 'exec uv run uvicorn parallax_worker.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --reload'
```

### Secrets and local environment

This repo uses **[dotenvx](https://dotenvx.com/)** via the **`@dotenvx/dotenvx`** package on the **gateway**. It replaces ad-hoc `export` lines in your shell and one-off `.env` files that are easy to commit by mistake. Dotenvx is **compatible with standard `.env` files** (same keys and values as `dotenv`), adds optional **encryption** (`.env.vault` / `.env.keys`) when you need it, and loads variables **before** the gateway reads `PORT` and other settings.

- **Gateway:** `gateway/src/index.ts` calls `config()` from `@dotenvx/dotenvx` at startup and loads **`gateway/.env`** when present (path resolved from the gateway package, so it works even if the working directory is not `gateway/`).
- **Worker:** For Phase 1, **uvicorn** does not load `.env` by itself. Use the **dotenvx CLI** command above when you want `worker/.env` applied; otherwise rely on defaults and the `--host` / `--port` flags.

### Environment variables (Phase 1 vs later)

| Scope | Required for Phase 1 health / startup | Optional (Phase 1) | Later phases (placeholders in `.env.example` only) |
|-------|----------------------------------------|--------------------|------------------------------------------------------|
| gateway | _none_ | `PORT` (default `3000`) | `WORKER_BASE_URL`, `GATEWAY_PUBLIC_URL`, `INTERNAL_CALLBACK_SECRET`, … |
| worker | _none_ | `HOST`, `PORT` (defaults match README / uvicorn; use `dotenvx` or flags to apply from `.env`) | `GATEWAY_CALLBACK_URL`, `COMFY_OUTPUT_DIR`, `INFERENCE_API_KEY`, … |

### Environment templates

Example env files (**placeholders only**—no real API keys, tokens, or private URLs) live next to each package:

- [`gateway/.env.example`](./gateway/.env.example)
- [`worker/.env.example`](./worker/.env.example)

Copy to `.env` locally. Do not commit `.env`, `.env.keys`, or `.env.vault`.

### Quality checks (development)

From `gateway/`: `bun run typecheck` and `bun run lint`. From `worker/`: `uv run ruff check src tests`.

## Architecture

1. **Gateway (Elysia)** accepts a request, assigns a `jobId`, stores state in an in-memory map, and returns `{ jobId: "…" }` immediately. It does not wait for inference.

2. **Queue** — The job is enqueued in `p-queue` (concurrency: 1). When it runs, the gateway `POST`s `/infer` with the serialized job as JSON.

3. **Worker (FastAPI)** receives `POST /infer`, responds with **202 Accepted**, and runs inference in a background task. The model manager loads the right model for the job, runs inference, and writes the result to disk.

4. **Completion callback** — When inference finishes, FastAPI `POST`s `/worker/done` to Elysia with `{ id, url }`. Elysia updates the job in the map and emits an SSE event on the channel the client opened for that `jobId`.

5. **Client** — The client receives the SSE event, may close the stream, and calls `GET /v1/job/:id`. Elysia returns the final status and URL of the generated asset.

## Deployment

**Local** — Elysia and FastAPI run on the same machine; they talk over HTTP on localhost. The model manager keeps models in VRAM and evicts by LRU under memory pressure.

**Cloud (RunPod, Vast AI, etc.)** — The API contract stays the same; only the base URL changes for clients. The Python worker can use GPUs with more VRAM so more models can stay resident at once.

## API reference

The gateway exposes a versioned REST API under `/v1`. An interactive Swagger UI is available at **`GET /swagger`** once the gateway is running.

### Job statuses

Every job moves through the following states:

| Status | Meaning | `url` field | `error` field |
|--------|---------|-------------|---------------|
| `pending` | Job accepted, waiting in queue | absent | absent |
| `running` | Worker is actively processing | absent | absent |
| `succeeded` | Inference completed successfully | **present** — URL of the generated asset | absent |
| `failed` | Inference failed | absent | **present** — human-readable error message |

### `POST /v1/jobs`

Create a new generation job. The job is enqueued immediately and processing starts asynchronously.

**Request body** (JSON):

```json
{
  "modelId": "string (required) — ID of the model to use",
  "modality": "string (required) — generation modality (e.g. txt2img)",
  "params": "object (required) — modality-specific parameters"
}
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `201 Created` | `{ "jobId": "uuid" }` | Job created successfully |
| `400 Bad Request` | `{ "error": "..." }` | Missing or invalid `modelId`, `modality`, or `params` |
| `422 Unprocessable Entity` | `{ "error": "..." }` | `modelId` not found, or `modality` not supported by the model |
| `503 Service Unavailable` | `{ "error": "Model configuration unavailable" }` | Model config file cannot be read or is invalid |

### `GET /v1/jobs/:id`

Retrieve the current state of a job.

**Response body** (`200 OK`):

```json
{
  "id": "string",
  "status": "pending | running | succeeded | failed",
  "createdAt": "ISO 8601 timestamp",
  "updatedAt": "ISO 8601 timestamp",
  "modelId": "string",
  "modality": "string",
  "url": "string (only when status is succeeded)",
  "error": "string (only when status is failed)"
}
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `200 OK` | Job object (see above) | Job found |
| `404 Not Found` | `{ "error": "Job not found" }` | Unknown `id` |

### `GET /v1/jobs/:id/events`

Subscribe to a job's terminal event via **Server-Sent Events** (SSE). The stream sends exactly one event when the job reaches a terminal state (`succeeded` or `failed`), then closes.

**Response headers:** `Content-Type: text/event-stream`

**SSE event format:**

```
data: {"id":"<jobId>","status":"succeeded","url":"<asset-url>"}\n\n
```

For a failed job:

```
data: {"id":"<jobId>","status":"failed","error":"<message>"}\n\n
```

If the job is already in a terminal state when the client connects, the event is sent immediately.

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `200 OK` (SSE stream) | Event stream | Job found |
| `404 Not Found` | `{ "error": "Job not found" }` | Unknown `id` |

### `GET /v1/models`

List all installed models grouped by type.

**Query parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `type` | string (optional) | Filter by type: `images`, `video`, `editing`, `audio`, `upscalers` |

**Response body** (`200 OK`):

```json
{
  "images": [ { "id": "...", "name": "...", "type": "images", "modalities": ["txt2img"], "description": "...", "components": {} } ],
  "video":  [],
  "editing": [],
  "audio":  [],
  "upscalers": []
}
```

When `?type=images` is provided, only the matching key is returned.

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `200 OK` | Models object (optionally filtered) | Success |
| `400 Bad Request` | `{ "error": "Invalid type. Valid values: images, video, editing, audio, upscalers" }` | Unknown type filter |
| `503 Service Unavailable` | `{ "error": "Model configuration unavailable" }` | Config unreadable |

### `GET /v1/models/:id`

Retrieve a single model by its unique ID.

**Response body** (`200 OK`):

```json
{
  "id": "string",
  "name": "string",
  "type": "images | video | editing | audio | upscalers",
  "modalities": ["txt2img"],
  "description": "string",
  "components": {}
}
```

**Responses:**

| Status | Body | Condition |
|--------|------|-----------|
| `200 OK` | Model object | Model found |
| `404 Not Found` | `{ "error": "Model not found" }` | Unknown `id` |
| `503 Service Unavailable` | `{ "error": "Model configuration unavailable" }` | Config unreadable |

### `GET /swagger`

Opens the interactive Swagger UI with the full OpenAPI spec for the gateway API.

---

## API design

Phased delivery is tracked in [ROADMAP.md](./ROADMAP.md).

- **Model discovery** — list installed models by type:
  - Images
  - Video
  - Editing
  - Audio
  - Upscalers

- **Inference** — generation flows by modality:
  - `txt2img`
  - `txt2vid`
  - `img2img`
  - `img2vid`
  - `txt2audio`
  - `upscale`
    - `image`
    - `video`

