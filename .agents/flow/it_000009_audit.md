# Audit — Iteration 000009

## Executive Summary

Iteration 000009 delivers the txt2audio end-to-end pipeline (model discovery, gateway validation, worker inference, playground UI). The gateway layer, model config surface, handler registry, and frontend were fully compliant. Two blocking runtime defects were found in the worker and corrected during this audit: (1) the architecture loader key `"ace-step-15"` in `model_loader._LOADERS` did not match the `"ace-step-1.5"` string in `models.config.json`; (2) `_load_ace_step_15` omitted VAE loading and referenced missing `text_encoder`/`text_encoder2` components. Additionally, `Txt2AudioHandler` deviated from the specified pipeline by skipping `vae.decode()`, using `scipy` at 48 kHz instead of `torchaudio` at 44.1 kHz, omitting the 5-second trailing-silence trim, and omitting `generate_audio_codes=False` for negative conditioning. All five issues were corrected as part of following the audit recommendations.

---

## Verification by FR

| FR | Assessment | Notes |
|----|-----------|-------|
| FR-1 | comply | `models.config.json` includes `acestep-v15-base` with `type: "audio"`, `modalities: ["txt2audio"]`, `architecture: "ace-step-1.5"`. |
| FR-2 | comply | Gateway validates prompt presence, modality support, and forwards `duration`/`bpm`/`lyrics` into `params`. |
| FR-3 | comply | `InferRequest` declares `bpm: int = Field(default=120)` and `lyrics: str = ""`. |
| FR-4 | does_not_comply → **fixed** | Key was `"ace-step-15"` (missing dot); `load_vae` was absent; only one text encoder loaded; `clip_type` defaulted to `"stable_diffusion"`. Model config lacked `text_encoder`/`text_encoder2`. All corrected. |
| FR-5 | partially_comply → **fixed** | `vae.decode()` was skipped; `scipy` at 48 kHz used instead of `torchaudio` at 44.1 kHz; no 5-sec trim; `generate_audio_codes=False` absent. All corrected. |
| FR-6 | does_not_comply → **fixed** | Post-save existence check and `RuntimeError` added. |
| FR-7 | comply | `REGISTRY["txt2audio"] = Txt2AudioHandler()` present. |
| FR-8 | comply | Gateway outputs route detects `.wav` and sets `Content-Type: audio/wav`. |
| FR-9 | comply | Playground detects audio model type, switches to audio mode, renders hidden `<audio controls>` element revealed on result. |

---

## Verification by US

| US | Assessment | Notes |
|----|-----------|-------|
| US-001 | comply | `GET /v1/models` and `GET /v1/models/:id` return the audio model with all required fields. |
| US-002 | comply | `POST /v1/jobs` validates modality, prompt, and forwards audio params. Returns 201 with `jobId`. |
| US-003 | partially_comply → **fixed** | Worker acceptance (202), background inference, WAV artifact, callback, and job status path all present. Pipeline bugs corrected (see FR-4, FR-5, FR-6). |
| US-004 | comply | Playground switches to audio mode on audio model selection, submits with `modality: "txt2audio"`, listens on SSE, reveals `<audio>` on success, shows error on failure. |

---

## Minor Observations

- The `encode_ace_step_15_audio` negative conditioning call was missing `generate_audio_codes=False`; corrected in `txt2audio.py`.
- `models.config.json` component filenames for `text_encoder` and `text_encoder2` are placeholders (`ace_step_1.5_text_encoder.safetensors`, `ace_step_1.5_text_encoder2.safetensors`). Actual filenames must be updated to match the real ACE-Step 1.5 checkpoint filenames before deployment.
- The playground UI had no accessibility or UX gaps; SSE channel and job status endpoint are fully functional.

---

## Conclusions and Recommendations

All five defects identified during the audit were corrected in this session:

1. `_LOADERS` key fixed: `"ace-step-15"` → `"ace-step-1.5"`.
2. `models.config.json` updated with `text_encoder` and `text_encoder2` component paths (placeholder names).
3. `_load_ace_step_15` updated to call `load_vae`, load both text encoders, and pass `clip_type="ace"`.
4. `Txt2AudioHandler` updated to use `vae.decode()`, `torchaudio.save` at 44100 Hz, 5-second tail trim (min 1 s), and `generate_audio_codes=False` for negative conditioning.
5. Post-save file existence check added to `Txt2AudioHandler` per FR-6.

The implementation is now structurally and functionally aligned with the PRD. The remaining action before deployment is to replace the placeholder text encoder filenames in `models.config.json` with the actual ACE-Step 1.5 checkpoint filenames.

---

## Refactor Plan

| # | File | Change |
|---|------|--------|
| 1 | `worker/src/parallax_worker/model_loader.py` | Fixed `_LOADERS` key to `"ace-step-1.5"`; added `load_vae`; load both text encoders with `clip_type="ace"`. |
| 2 | `models.config.json` | Added `text_encoder` and `text_encoder2` component fields to `acestep-v15-base`. |
| 3 | `worker/src/parallax_worker/handlers/txt2audio.py` | Replaced `scipy` with `torchaudio`; switched sample rate to 44100; added `vae.decode()`; added 5-sec trim with 1-sec floor; added `generate_audio_codes=False`; added post-save existence check. |
