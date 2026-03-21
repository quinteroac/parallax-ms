# Requirement: Model Discovery API

## Context

Clients currently have no way to query which models are available on the server. This feature introduces a model discovery API backed by a `models.config.json` file that the gateway reads at startup. Clients can list all models (grouped by type), filter by type, or fetch a single model by ID. This aligns with Phase 4 of the roadmap's discovery requirement.

## Goals

- Expose a stable `GET /v1/models` discovery endpoint that returns installed models grouped by type.
- Allow clients to filter models by type via query parameter.
- Allow clients to retrieve a single model's full component details by ID.
- Keep discovery entirely within the existing gateway (TypeScript / Bun / Elysia) — no new services.
- Gracefully handle a missing or malformed `models.config.json`.

## User Stories

### US-001: List all models grouped by type

**As a** client application, **I want** to call `GET /v1/models` **so that** I can display all available models organised by category.

**Acceptance Criteria:**
- [ ] `GET /v1/models` returns HTTP 200 with a JSON body shaped as `{ images: [...], video: [...], editing: [...], audio: [...], upscalers: [...] }`.
- [ ] Each entry in the arrays includes at minimum: `id`, `name`, `type`, `modalities`, `description`, and `components`.
- [ ] Types with no configured models return an empty array (`[]`), not a missing key.
- [ ] If `models.config.json` is missing or cannot be parsed, the endpoint returns HTTP 503 with `{ error: "Model configuration unavailable" }`.
- [ ] Typecheck / lint passes.

---

### US-002: Filter models by type

**As a** client application, **I want** to call `GET /v1/models?type=images` **so that** I only receive models relevant to the modality I support.

**Acceptance Criteria:**
- [ ] `GET /v1/models?type=images` returns HTTP 200 with `{ images: [...] }` containing only models whose `type` is `images`.
- [ ] Valid type values: `images`, `video`, `editing`, `audio`, `upscalers` (case-insensitive).
- [ ] An unknown `type` value returns HTTP 400 with `{ error: "Invalid type. Valid values: images, video, editing, audio, upscalers" }`.
- [ ] If the valid type has no configured models, returns `{ <type>: [] }`.
- [ ] Typecheck / lint passes.

---

### US-003: Get a single model by ID

**As a** client application, **I want** to call `GET /v1/models/:id` **so that** I can inspect the full component details of a specific model before submitting an inference job.

**Acceptance Criteria:**
- [ ] `GET /v1/models/:id` returns HTTP 200 with the full model object (including `components` with all sub-paths: `unet`, `checkpoint`, `clip`, `text_encoder`, `vae.image`, `vae.audio`, etc.) when the ID exists.
- [ ] Returns HTTP 404 with `{ error: "Model not found" }` when the ID does not exist.
- [ ] Typecheck / lint passes.

---

### US-004: `models.config.json` schema and file placement

**As a** developer, **I want** a documented and validated `models.config.json` **so that** I can configure models without guessing the expected shape.

**Acceptance Criteria:**
- [ ] A `models.config.json` file is created at the project root (or a documented location, configurable via `MODELS_CONFIG_PATH` env var).
- [ ] The file contains at least one example entry for each model architecture variant: bundled checkpoint, separate unet + dual-clip + image VAE, and separate unet + multi-VAE (image + audio).
- [ ] The gateway loads and validates the file on startup; a Zod (or equivalent) schema enforces the shape and logs a clear error if validation fails.
- [ ] A `models.config.example.json` (or inline README section) documents every supported field.
- [ ] Typecheck / lint passes.

---

## Functional Requirements

- **FR-1:** The gateway reads `models.config.json` from the path defined by `MODELS_CONFIG_PATH` env var, defaulting to `./models.config.json` relative to the gateway package root.
- **FR-2:** The config file schema supports a top-level `models` array. Each entry has: `id` (string, unique), `name` (string), `type` (enum: `images | video | editing | audio | upscalers`), `modalities` (string array), `description` (string), and `components` (object).
- **FR-3:** `components` is a flexible object with optional keys: `checkpoint` (string), `unet` (string), `clip` (string | string[]), `text_encoder` (string), `vae` (object with optional `image` string and `audio` string).
- **FR-4:** All component paths are relative strings; the gateway does not validate that files exist on disk at startup.
- **FR-5:** `GET /v1/models` groups models by type and always returns all five type keys.
- **FR-6:** `GET /v1/models?type=<t>` returns only the matching type key.
- **FR-7:** `GET /v1/models/:id` performs a lookup by `id` field.
- **FR-8:** On missing or unparseable config, all three endpoints return HTTP 503 with `{ error: "Model configuration unavailable" }`.

## Non-Goals (Out of Scope)

- Validating that model checkpoint files actually exist on disk.
- Authentication or authorisation on discovery endpoints.
- Hot-reloading `models.config.json` without restarting the gateway.
- Updating the playground page (`/playground`) with a model selector (deferred).
- Versioned API contract / OpenAPI documentation (Phase 4 remainder, separate iteration).
- Per-model capability errors during inference (handled in later phases).

## Open Questions

- None
