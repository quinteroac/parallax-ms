# Audit — Iteration 000004

## Executive Summary

The implementation for iteration 000004 successfully delivers the models discovery API (`GET /v1/models`, `GET /v1/models?type=`, `GET /v1/models/:id`) with correct HTTP semantics, 503/404/400 error handling, startup validation, env-var-based config path, and full test coverage. The principal gap identified was a structural divergence in the `components` field: FR-2 and FR-3 required a named-key object (`checkpoint`, `unet`, `clip`, `text_encoder`, `vae.image/audio`), but the implementation had used a flat string array. A stale `gateway/src/models.config.json` file also existed alongside the canonical project-root config. Both issues have been resolved as part of this audit's refactor.

## Verification by FR

| FR | Assessment | Notes |
|---|---|---|
| FR-1 | comply | Config loaded from `MODELS_CONFIG_PATH` env var, falls back to project root `models.config.json`. |
| FR-2 | comply | Schema enforces `id`, `name`, `type` enum (5 values), `modalities`, `description`, `components` (named-key object). Additionally includes `architecture` enum for wiring context. |
| FR-3 | comply | `components` is now a named-key object: `checkpoint?`, `unet?`, `clip? (string\|string[])`, `text_encoder?`, `vae?: { image?, audio? }`. |
| FR-4 | comply | Component values are relative strings; no disk validation at startup. |
| FR-5 | comply | `GET /v1/models` always returns all five type keys (`images`, `video`, `editing`, `audio`, `upscalers`). |
| FR-6 | comply | `GET /v1/models?type=<t>` returns only the matching key; case-insensitive; 400 on unknown type. |
| FR-7 | comply | `GET /v1/models/:id` performs lookup by `id` field; returns full model object. |
| FR-8 | comply | HTTP 503 with `{ error: "Model configuration unavailable" }` returned by all endpoints on missing or unparseable config. |

## Verification by US

| US | Assessment | Notes |
|---|---|---|
| US-001 | comply | AC01: 200 with all 5 keys. AC02: each entry has `id`, `name`, `type`, `modalities`, `description`, `components` (object). AC03: empty types return `[]`. AC04: 503 on missing config. AC05: typecheck/lint pass. |
| US-002 | comply | AC01: filtered response with single key. AC02: case-insensitive type param. AC03: 400 on invalid type. AC04: valid empty type returns `{ <type>: [] }`. AC05: typecheck/lint pass. |
| US-003 | comply | AC01: 200 with full model object including named `components` keys. AC02: 404 with `{ error: "Model not found" }`. AC03: typecheck/lint pass. |
| US-004 | comply | AC01: `models.config.json` at project root, respects `MODELS_CONFIG_PATH`. AC02: three architecture variants covered. AC03: custom validation (Zod-equivalent) with clear error messages. AC04: `models.config.example.json` documents all fields. AC05: typecheck/lint pass. |

## Minor Observations

- The `architecture` enum field (`bundled-checkpoint`, `separate-unet-dual-clip-image-vae`, `separate-unet-multi-vae`) was added beyond the PRD scope. It is tested and documented; if kept, it should be formally added to the PRD in a future iteration.
- Startup validation does not halt the server on invalid config — it logs the error but continues listening in a degraded 503 state. Consider failing fast if config is mandatory.
- Custom validation is used instead of Zod (acceptable per PRD "or equivalent"); this choice is worth noting in the README or CLAUDE.md for team awareness.

## Conclusions and Recommendations

All 8 functional requirements and 4 user stories are now fully compliant following the refactor. The `components` field now matches the PRD-specified named-key object structure across the schema, interfaces, config files, and tests. The stale `gateway/src/models.config.json` has been removed.

## Refactor Plan

The following changes were applied:

1. **`gateway/src/model-config-schema.ts`** — Added `ModelComponents` interface with optional named keys (`checkpoint`, `unet`, `clip`, `text_encoder`, `vae: { image, audio }`). Replaced flat-array validation with `validateComponents()` function that validates each key's type. Updated `ModelConfigEntry.components` type.

2. **`gateway/src/model-store.ts`** — Updated `ModelEntry.components` from `string[]` to `ModelComponents` (imported from schema). Applied Prettier format fix.

3. **`models.config.json`** (project root) — Restructured each model's `components` from a flat array to a named-key object matching each architecture variant:
   - `stable-diffusion-v1-5`: `{ checkpoint: "v1-5-pruned-emaonly.safetensors" }`
   - `stable-diffusion-xl-base`: `{ unet: "...", clip: ["clip_l.safetensors", "clip_g.safetensors"], vae: { image: "..." } }`
   - `comfy-audio-video-gen`: `{ unet: "...", vae: { image: "...", audio: "..." } }`

4. **`models.config.example.json`** — Same restructuring as the canonical config.

5. **`gateway/src/models.test.ts`** — Updated `imageModel` and `fullModel` fixtures to use `ModelComponents` objects. Updated US-001-AC02 assertion from `Array.isArray(m.components)` to `typeof m.components === "object"`. Updated US-003-AC01 `toEqual` assertion to match object shape. Updated real-model test assertions.

6. **`gateway/src/us004.test.ts`** — Updated all test fixtures from `components: ["model.safetensors"]` (array) to `components: { checkpoint: "model.safetensors" }` (object).

7. **`gateway/src/models.config.json`** — Deleted. This stale file (missing `architecture` field, not used at runtime) was a source of developer confusion.
