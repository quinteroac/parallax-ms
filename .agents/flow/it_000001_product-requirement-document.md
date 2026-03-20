# Requirement: Phase 1 — Repository foundation and runtimes

## Context

Parallax Media Server needs a maintainable skeleton before client-facing jobs and inference work. **End users** ultimately depend on a service they can run and trust; this iteration establishes what **developers and operators** need to install, configure, and verify so those foundations exist. This requirement matches **Phase 1** in [ROADMAP.md](../../ROADMAP.md): Bun-based gateway, uv-managed Python worker, documented secrets handling, and independent health endpoints—without implementing Phase 2 (jobs queue, SSE, stub inference) or later phases.

## Goals

- Deliver a **monorepo or clearly separated packages** with **Bun** for the gateway and **uv** for the Python worker, with **documented install and run** commands.
- Provide **local configuration** using **dotenvx**, plus **example environment templates** that contain **no real secrets**.
- Ensure the **gateway** and **worker** processes start **independently** and each expose at least one **HTTP health or readiness** route with **documented** paths and success semantics.
- Align **declared dependencies** in manifests with the **stack table** in [README.md](../../README.md) (e.g. Elysia, FastAPI, Uvicorn, and other listed choices as applicable).

## User Stories

Each story is scoped to complete in one focused implementation session.

### US-001: Monorepo layout and documented install/run

**As a** developer **setting up** Parallax **for** future end-user traffic, **I want** a clear repository layout and documented commands to install and start both the gateway and worker **so that** the stack can be reproduced consistently.

**Acceptance Criteria:**

- [ ] Repository uses a **monorepo** or **documented multi-package** layout separating the Node gateway and Python worker.
- [ ] **Install** steps for the gateway use **Bun**; **install** steps for the worker use **uv** (or documented equivalent); both are written in project docs (e.g. README).
- [ ] **Run** commands to start the gateway and worker are documented and do not rely on undocumented environment variables beyond what is provided by templates (see US-002).
- [ ] Typecheck / lint passes for added or modified code where tooling exists.

### US-002: Local secrets and example environment templates

**As a** developer, **I want** documented secret handling and non-secret example env files **so that** local configuration is repeatable without committing credentials.

**Acceptance Criteria:**

- [ ] **dotenvx** is used for secret handling and **documented** (how to install and use it locally).
- [ ] **Example** env template(s) exist (e.g. `.env.example` or project-documented names) and contain **placeholders only**—no real API keys, tokens, or private URLs.
- [ ] Documentation states **which variables** are required for Phase 1 startup (gateway + worker health) vs optional for later phases.
- [ ] Typecheck / lint passes for added or modified code where tooling exists.

### US-003: Gateway HTTP health or readiness

**As a** developer, **I want** the gateway to expose a documented HTTP health or readiness route **so that** orchestrators and humans can verify the process is live.

**Acceptance Criteria:**

- [ ] Gateway process starts successfully using documented commands and required env from templates.
- [ ] At least one **HTTP** route (path and method) is exposed for **health** or **readiness**; response documents **success** status code and a minimal body or headers suitable for probes.
- [ ] Route behavior is **documented** in README or equivalent (URL path, expected status).
- [ ] Typecheck / lint passes for added or modified code where tooling exists.

### US-004: Worker HTTP health (aligned with gateway)

**As a** developer, **I want** the Python worker to start independently and expose a health route **so that** deployment and debugging do not depend on the gateway being up.

**Acceptance Criteria:**

- [ ] Worker process starts successfully using documented **uv**-based (or documented equivalent) commands.
- [ ] At least one **HTTP** health (or readiness) route exists; **documented** path, method, and success criteria.
- [ ] Semantics are **consistent with** the gateway’s health story (documented: e.g. both return HTTP success when process is ready, or explicit distinction if they differ).
- [ ] Typecheck / lint passes for added or modified Python and config where tooling exists.

### US-005: README stack table reflected in dependencies

**As a** maintainer, **I want** package manifests to match the README stack table **so that** declared versions and libraries are not misleading.

**Acceptance Criteria:**

- [ ] Gateway manifest(s) (e.g. `package.json`) include **Elysia** and other Node stack items **as listed in README** for the gateway, or README is **updated** to match intentional deviations.
- [ ] Worker manifest / lock (e.g. `pyproject.toml` / lockfile) includes **FastAPI**, **Uvicorn**, and other Python stack items **as listed in README**, or README is **updated** to match intentional deviations.
- [ ] **No** README row for Phase 1 scope silently contradicts the chosen dependencies (either implement or adjust docs).
- [ ] Typecheck / lint passes for added or modified code where tooling exists.

## Functional Requirements

- **FR-1:** The repository SHALL provide a Bun-driven gateway package and a uv-driven Python worker package (or equivalent documented layout).
- **FR-2:** Documentation SHALL describe how to install dependencies and start each process without undisclosed steps.
- **FR-3:** Local configuration SHALL use **dotenvx**; example env files SHALL not contain real secrets.
- **FR-4:** The gateway SHALL expose at least one HTTP health or readiness endpoint when running; behavior SHALL be documented.
- **FR-5:** The worker SHALL expose at least one HTTP health (or readiness) endpoint when running; behavior SHALL be documented and aligned with the gateway’s documented probe story.
- **FR-6:** Declared dependencies in manifests SHALL be consistent with the stack described in README for Phase 1 scope, or README SHALL be updated to reflect the actual choices.

## Non-Goals (Out of Scope)

- Job creation, `jobId` lifecycle, in-memory job map, **p-queue**, or **SSE** (Phase 2).
- Worker **POST /infer**, **202 Accepted**, background inference tasks, or callback to gateway (Phase 2).
- Real **comfy-diffusion** inference, model manager behavior, or artifact URLs (Phase 3+).
- **Model discovery** API, versioned public job contract beyond what Phase 1 needs for health (Phase 4+).
- Production hardening beyond documented local/dev setup (e.g. full Kubernetes manifests), unless explicitly required for health verification—out of scope for this PRD.
