# Project Context

<!-- Created or updated by `nvst create project-context`. Cap: 250 lines. -->

## Conventions

- **Language (repository):** All repository content (docs, comments, user-facing strings in code) is **English** — see [AGENTS.md](../AGENTS.md).
- **Naming:** TypeScript/JavaScript: `camelCase` for variables and functions, `PascalCase` for types/classes, kebab-case or lowercase for package and file names as established in the gateway package. Python: `snake_case` for modules, functions, and variables; `PascalCase` for Pydantic models and classes.
- **Formatting:** When tooling is added, prefer **Prettier + ESLint** for the Bun gateway and **Ruff** (or project `pyproject` tool config) for the Python worker; run formatters from each package root. Until manifests exist, match configs committed alongside code.
- **Git flow:** Prefer **feature branches** tied to iterations (e.g. `feature/it_000001`) or short-lived branches merged via PR; trunk-based is acceptable if the team documents it. Commit messages should state intent clearly; no strict prefix required unless CI adds one.
- **Workflow:** Phased delivery follows [ROADMAP.md](../ROADMAP.md). **Stack choices in README and ROADMAP are fixed** — swapping technologies requires updating those documents first.

## Tech Stack

- **Language(s):** TypeScript (gateway), Python 3 (worker).
- **Runtime:** [Bun](https://bun.sh/) for the gateway; CPython managed with **[uv](https://docs.astral.sh/uv/)** for the worker.
- **Frameworks:** [Elysia](https://elysiajs.com/) (HTTP, SSE on the gateway); [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) (ASGI) on the worker.
- **Key libraries (target, per README):** Gateway: `p-queue` (in-memory queue, concurrency 1), optional [Portless](https://portless.dev/) for local HTTPS, [dotenvx](https://dotenvx.com/) for env/secrets. Worker: [Pydantic](https://docs.pydantic.dev/), [comfy-diffusion](https://github.com/quinteroac/comfy-diffusion) (inference — later phases).
- **Package manager:** **Bun** for Node dependencies; **uv** for Python (`uv sync`, `uv run`, etc.) as documented in the README.
- **Build / tooling:** Typecheck and lint for added or modified code where tooling exists (PRD acceptance). Lockfiles and manifests must stay aligned with the [README stack table](../README.md#stack).

## Code Standards

- **Style patterns:** Prefer small, explicit modules; async HTTP handlers where frameworks expect it; validate external input at boundaries (Elysia schemas, Pydantic models). Environment variables loaded via dotenvx or the documented equivalent — never commit secrets.
- **SOLID principles:** All code in both the gateway and worker MUST follow SOLID:
  - **S — Single Responsibility:** Each module, class, or function has one reason to change (e.g. route handler, queue manager, and job store are separate concerns).
  - **O — Open/Closed:** Extend behavior via new modules or strategy objects; avoid modifying stable, tested code for new features.
  - **L — Liskov Substitution:** Subtypes and interface implementations must be substitutable for their base types without altering program correctness.
  - **I — Interface Segregation:** Prefer narrow, focused interfaces/types over wide, multi-purpose ones; Pydantic models and Elysia schemas should cover only what each endpoint needs.
  - **D — Dependency Inversion:** High-level modules (route handlers, job logic) depend on abstractions (interfaces/protocols), not on concrete implementations (specific HTTP clients, model loaders).
- **Error handling:** Return appropriate HTTP status codes; surface worker failures to job state in later phases; for Phase 1, health endpoints return clear success semantics for probes.
- **Module organisation:** Monorepo or clearly separated packages: one **gateway** tree (Bun + Elysia) and one **worker** tree (uv + FastAPI), each independently startable with documented commands.
- **Forbidden patterns:** Do not contradict the README/ROADMAP stack without a documented revision; do not add real secrets to example env files; do not introduce undeclared env vars in run instructions beyond templates.

## Testing Strategy

- **Approach:** **Code first, tests after** for new code unless a story mandates TDD; add automated tests for **critical paths** (health, job lifecycle, inference) as packages gain structure. PRD iteration **000001** requires **typecheck/lint** where tooling exists.
- **Runner (planned):** **Vitest** (or Bun’s test runner if adopted in the gateway package) for TypeScript; **pytest** for Python when test layout is added.
- **Coverage targets:** None mandated for Phase 1; raise thresholds in later phases when agreed.
- **Test location convention:** Co-located `*.test.ts` / `*.spec.ts` or `tests/` per package convention once scaffolded; Python `tests/` mirroring package layout under uv.

## Product Architecture

- **High-level description:** Parallax Media Server exposes a unified API for media generation backed by **comfy-diffusion**. A **gateway** accepts client traffic, tracks jobs, and coordinates with a **Python worker** that runs inference. Phased roadmap: foundation → async jobs + stub worker → real inference → discovery + versioned API → per-modality inference.
- **Main components / layers:** **Gateway (Elysia):** HTTP + SSE, in-memory job map, queue to forward work to the worker. **Worker (FastAPI):** `POST /infer`, background tasks, model manager, disk artifacts, callback to gateway. **Client:** Uses job id, SSE, and `GET /v1/job/:id` (full contract in later phases).
- **Data flow summary:** Client → gateway creates job → queue → worker infers → worker POSTs completion to gateway → SSE notifies client → client fetches final job state. Phase 1 only requires independent processes and **documented health/readiness** endpoints.

## Modular Structure

- **`gateway` (Bun + Elysia):** Public HTTP API, job state, queue, SSE, callback receiver (`/worker/done`), static or proxied asset URLs as designed.
- **`worker` (uv + FastAPI):** Inference API, background execution, integration with comfy-diffusion, on-disk outputs.
- **Shared contract:** JSON job payloads and versioned routes under `/v1/...` (locked in Phase 4); Phase 1 focuses on layout, env, and health.

## Implemented Capabilities

<!-- Updated at the end of each iteration by nvst create project-context -->

- **Iteration 000001 (current):** Requirements and PRD approved for repository foundation (monorepo layout, Bun/uv, dotenvx or equivalent, documented health routes, README-aligned manifests). **Implementation not yet landed** — gateway/worker packages and manifests are still to be added in prototype work.
