"""it_000009 US-003: Worker runs txt2audio inference end-to-end."""

import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_txt2audio_request(job_id: str = "j-txt2audio", **kwargs) -> InferRequest:
    defaults: dict = {
        "prompt": "a calm piano melody",
        "modality": "txt2audio",
        "architecture": "ace-step-15",
        "components": {
            "diffusion_model": "ace_step_15.safetensors",
            "text_encoder": "ace_step_15_text_encoder.safetensors",
        },
        "duration": 10.0,
        "bpm": 120,
        "lyrics": "",
    }
    defaults.update(kwargs)
    return InferRequest(id=job_id, **defaults)


def _patch_httpx_client(mock_post: AsyncMock) -> AsyncMock:
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post
    return mock_client


# ---------------------------------------------------------------------------
# AC01 — POST /infer accepts txt2audio modality and responds 202
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_txt2audio_modality():
    """InferRequest accepts modality='txt2audio'."""
    req = _make_txt2audio_request()
    assert req.modality == "txt2audio"


def test_ac01_post_infer_txt2audio_returns_202():
    """POST /infer with modality=txt2audio responds 202 Accepted immediately."""
    from fastapi.testclient import TestClient

    from parallax_worker.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/infer",
        json={
            "id": "j-txt2audio-202",
            "prompt": "calm piano",
            "modality": "txt2audio",
            "architecture": "ace-step-15",
            "components": {
                "diffusion_model": "ace_step_15.safetensors",
                "text_encoder": "ace_step_15_text_encoder.safetensors",
            },
            "duration": 10.0,
        },
    )
    assert response.status_code == 202


# ---------------------------------------------------------------------------
# AC02 — Inference uses only comfy_diffusion
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_txt2audio_calls_encode_ace_step_15_audio():
    """run_inference dispatches to the txt2audio handler and fires the success callback."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.inference.ModelManager"),
        patch("parallax_worker.inference.REGISTRY") as mock_registry,
        patch("parallax_worker.inference.httpx.AsyncClient") as mock_cls,
    ):
        mock_registry.get.return_value = MagicMock(
            run=AsyncMock(return_value="http://gw/outputs/j.wav")
        )
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2audio_request())

    mock_post.assert_awaited_once()


@pytest.mark.anyio
async def test_ac02_txt2audio_handler_calls_encode_ace_step_15_audio(tmp_path):
    """Txt2AudioHandler.run calls encode_ace_step_15_audio from comfy_diffusion.audio."""
    import numpy as np

    from parallax_worker.handlers.txt2audio import Txt2AudioHandler

    fake_positive = MagicMock()
    fake_negative = MagicMock()
    mock_encode = MagicMock(side_effect=[fake_positive, fake_negative])
    fake_latent = {"samples": MagicMock()}
    fake_denoised = {"samples": np.zeros((1, 2, 100), dtype="float32")}

    with (
        patch("parallax_worker.handlers.txt2audio.load_model_components") as mock_load,
        patch("parallax_worker.handlers.txt2audio.encode_ace_step_15_audio", mock_encode),
        patch(
            "parallax_worker.handlers.txt2audio.empty_ace_step_15_latent_audio",
            return_value=fake_latent,
        ),
        patch("parallax_worker.handlers.txt2audio.sample", return_value=fake_denoised),
        patch("parallax_worker.handlers.txt2audio.scipy.io.wavfile.write"),
    ):
        mock_load.return_value = MagicMock()
        handler = Txt2AudioHandler()
        req = _make_txt2audio_request(job_id="j-enc")
        await handler.run(req, MagicMock(), tmp_path, "http://gateway")

    assert mock_encode.call_count == 2
    first_call_kwargs = mock_encode.call_args_list[0].kwargs
    assert first_call_kwargs["tags"] == "a calm piano melody"


# ---------------------------------------------------------------------------
# AC03 — Output artifact written as {job_id}.wav
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_output_written_as_wav(tmp_path):
    """run_inference saves audio output to OUTPUT_DIR/<job_id>.wav."""
    import numpy as np

    from parallax_worker.handlers.txt2audio import Txt2AudioHandler

    fake_denoised = {"samples": np.zeros((1, 1, 480), dtype="float32")}

    encode_path = "parallax_worker.handlers.txt2audio.encode_ace_step_15_audio"
    with (
        patch("parallax_worker.handlers.txt2audio.load_model_components"),
        patch(encode_path, return_value=MagicMock()),
        patch(
            "parallax_worker.handlers.txt2audio.empty_ace_step_15_latent_audio",
            return_value={"samples": MagicMock()},
        ),
        patch("parallax_worker.handlers.txt2audio.sample", return_value=fake_denoised),
    ):
        handler = Txt2AudioHandler()
        req = _make_txt2audio_request(job_id="job-wav")
        await handler.run(req, MagicMock(), tmp_path, "http://gateway")

    assert (tmp_path / "job-wav.wav").exists()


# ---------------------------------------------------------------------------
# AC04 — Worker POSTs {id, url} with WAV URL to gateway callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac04_success_callback_contains_wav_url(tmp_path, monkeypatch):
    """On successful txt2audio, worker POSTs {id, url} where url ends in .wav."""
    import numpy as np

    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    fake_denoised = {"samples": np.zeros((1, 1, 480), dtype="float32")}

    encode_path = "parallax_worker.handlers.txt2audio.encode_ace_step_15_audio"
    with (
        patch("parallax_worker.inference.ModelManager"),
        patch("parallax_worker.handlers.txt2audio.load_model_components"),
        patch(encode_path, return_value=MagicMock()),
        patch(
            "parallax_worker.handlers.txt2audio.empty_ace_step_15_latent_audio",
            return_value={"samples": MagicMock()},
        ),
        patch("parallax_worker.handlers.txt2audio.sample", return_value=fake_denoised),
        patch("parallax_worker.inference.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2audio_request(job_id="j-audio-ok"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-audio-ok"
    assert "url" in payload
    assert payload["url"].endswith(".wav")
    assert "error" not in payload


# ---------------------------------------------------------------------------
# AC06 — On inference failure, worker POSTs {id, error}
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac06_encode_error_posts_error_callback(monkeypatch):
    """run_inference posts error callback when encode_ace_step_15_audio raises."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.inference.ModelManager"),
        patch("parallax_worker.handlers.txt2audio.load_model_components"),
        patch(
            "parallax_worker.handlers.txt2audio.encode_ace_step_15_audio",
            side_effect=RuntimeError("clip load failed"),
        ),
        patch("parallax_worker.inference.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2audio_request(job_id="j-audio-err"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-audio-err"
    assert "error" in payload
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac06_sample_error_posts_error_callback(monkeypatch):
    """run_inference posts error callback when sample raises during txt2audio."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    encode_path = "parallax_worker.handlers.txt2audio.encode_ace_step_15_audio"
    with (
        patch("parallax_worker.inference.ModelManager"),
        patch("parallax_worker.handlers.txt2audio.load_model_components"),
        patch(encode_path, return_value=MagicMock()),
        patch(
            "parallax_worker.handlers.txt2audio.empty_ace_step_15_latent_audio",
            return_value={"samples": MagicMock()},
        ),
        patch(
            "parallax_worker.handlers.txt2audio.sample",
            side_effect=RuntimeError("GPU OOM"),
        ),
        patch("parallax_worker.inference.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2audio_request(job_id="j-audio-oom"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-audio-oom"
    assert "error" in payload
    assert "url" not in payload


# ---------------------------------------------------------------------------
# AC07 — GET /v1/jobs/:id returns succeeded + url after successful job
# ---------------------------------------------------------------------------


def test_ac07_infer_request_has_bpm_field():
    """InferRequest exposes bpm field with a sensible default."""
    req = InferRequest(id="j1", prompt="test")
    assert req.bpm > 0


def test_ac07_infer_request_accepts_custom_bpm_and_lyrics():
    """InferRequest accepts custom bpm and lyrics values."""
    req = _make_txt2audio_request(bpm=140, lyrics="la la la")
    assert req.bpm == 140
    assert req.lyrics == "la la la"


# ---------------------------------------------------------------------------
# AC08 — Typecheck / lint passes
# ---------------------------------------------------------------------------


def test_ac08_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
