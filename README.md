# Parallax Media Server

Parallax Media Server is a media server built on [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) that exposes a unified API for image, video, and other media generation using local and remote inference.

## Motivation

When building apps that need media generation, inference code is often reimplemented in every project. Parallax separates the inference server from client applications so you can run it locally or on cloud GPUs (e.g. RunPod, Vast AI) without changing the API contract.

## Stack

| Area | Technologies |
|------|----------------|
| Languages | Python, Node.js |
| Package / runtime | [Bun](https://bun.sh/), [uv](https://docs.astral.sh/uv/) |
| Node (gateway) | [Elysia](https://elysiajs.com/) — HTTP server and SSE; [p-queue](https://github.com/sindresorhus/p-queue) — in-memory job queue (concurrency: 1); [Portless](https://portless.dev/) — stable `.localhost` URLs with HTTPS for local dev; [dotenvx](https://dotenvx.com/) — encrypted `.env` and secrets for development |
| Python (worker) | [FastAPI](https://fastapi.tiangolo.com/) — worker HTTP API; [Uvicorn](https://www.uvicorn.org/) — ASGI server; [Pydantic](https://docs.pydantic.dev/) — request/response validation; [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) — inference engine and model management |

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

No environment variables are **required** for Phase 1 startup. Optional variables (`PORT`, `HOST` for the worker) are listed only in the example files below—copy them if you want non-default ports or bind addresses.

**Gateway**

```bash
cd gateway && bun run dev
```

By default the gateway listens on **port 3000**. Override with the optional `PORT` variable documented in [`gateway/.env.example`](./gateway/.env.example).

**Worker**

```bash
cd worker && uv run uvicorn parallax_worker.main:app --host 0.0.0.0 --port 8000 --reload
```

By default the worker listens on **port 8000**. Override `--port` / `--host` as needed, or use the optional `PORT` and `HOST` values documented in [`worker/.env.example`](./worker/.env.example).

### Environment templates

Example env files (placeholders only, no secrets) live next to each package:

- [`gateway/.env.example`](./gateway/.env.example)
- [`worker/.env.example`](./worker/.env.example)

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

