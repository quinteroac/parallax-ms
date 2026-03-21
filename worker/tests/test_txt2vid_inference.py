"""it_000008 US-003: Worker runs txt2vid inference end-to-end."""

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


def _make_txt2vid_request(job_id: str = "j-txt2vid", **kwargs) -> InferRequest:
    defaults: dict = {
        "prompt": "a beautiful sunset over the ocean",
        "modality": "txt2vid",
        "architecture": "separate-diffusion-model",
        "components": {
            "diffusion_model": "wan_video_t2v_14b.safetensors",
            "vae": "wan_video_vae.safetensors",
            "text_encoder": "umt5_xxl.safetensors",
        },
        "width": 832,
        "height": 480,
        "duration": 3.0,
    }
    defaults.update(kwargs)
    return InferRequest(id=job_id, **defaults)


def _patch_httpx_client(mock_post: AsyncMock) -> tuple:
    """Return a configured mock AsyncClient for patching httpx.AsyncClient."""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = mock_post
    return mock_client


# ---------------------------------------------------------------------------
# AC01 — POST /infer accepts txt2vid modality with required fields
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_txt2vid_modality():
    """InferRequest accepts modality='txt2vid'."""
    req = _make_txt2vid_request()
    assert req.modality == "txt2vid"


def test_ac01_infer_request_has_duration_field_with_default():
    """InferRequest exposes duration with a positive default."""
    req = InferRequest(id="j1", prompt="test")
    assert req.duration > 0


def test_ac01_infer_request_accepts_custom_duration():
    """InferRequest accepts a custom duration value."""
    req = _make_txt2vid_request(duration=10.0)
    assert req.duration == 10.0


def test_ac01_infer_request_accepts_width_height():
    """InferRequest accepts width and height for video frames."""
    req = _make_txt2vid_request(width=1280, height=720)
    assert req.width == 1280
    assert req.height == 720


def test_ac01_post_infer_txt2vid_returns_202():
    """POST /infer with modality=txt2vid responds 202 Accepted."""
    from fastapi.testclient import TestClient

    from parallax_worker.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/infer",
        json={
            "id": "j-txt2vid-202",
            "prompt": "a sunset",
            "modality": "txt2vid",
            "architecture": "separate-diffusion-model",
            "components": {
                "diffusion_model": "wan_video_t2v_14b.safetensors",
                "vae": "wan_video_vae.safetensors",
                "text_encoder": "umt5_xxl.safetensors",
            },
            "width": 832,
            "height": 480,
            "duration": 3.0,
        },
    )

    assert response.status_code == 202


# ---------------------------------------------------------------------------
# AC02 — Inference runs asynchronously; uses comfy_diffusion exclusively
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_txt2vid_calls_wan_image_to_video():
    """run_inference calls wan_image_to_video with correct width/height/length."""
    fake_positive = MagicMock()
    fake_negative = MagicMock()
    fake_latent = {"samples": MagicMock()}
    mock_wan = MagicMock(return_value=(fake_positive, fake_negative, fake_latent))
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.wan_image_to_video", mock_wan),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=MagicMock()),
        patch("parallax_worker.tasks.save_video"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        req = _make_txt2vid_request(width=832, height=480, duration=3.0)
        await run_inference(req)

    mock_wan.assert_called_once()
    call_kwargs = mock_wan.call_args.kwargs
    assert call_kwargs["width"] == 832
    assert call_kwargs["height"] == 480
    # duration=3.0 * video_fps=16 → length=48
    assert call_kwargs["length"] == 48


@pytest.mark.anyio
async def test_ac02_txt2vid_calls_sample_with_wan_latent():
    """run_inference calls sample with the latent returned by wan_image_to_video."""
    fake_latent = {"samples": MagicMock()}
    fake_pos = MagicMock()
    fake_neg = MagicMock()
    mock_sample = MagicMock(return_value=MagicMock())
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.wan_image_to_video",
            return_value=(fake_pos, fake_neg, fake_latent),
        ),
        patch("parallax_worker.tasks.sample", mock_sample),
        patch("parallax_worker.tasks.vae_decode", return_value=MagicMock()),
        patch("parallax_worker.tasks.save_video"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2vid_request())

    mock_sample.assert_called_once()
    # sample(model, positive, negative, latent, ...) — latent is the 4th positional arg
    assert mock_sample.call_args.args[3] is fake_latent


# ---------------------------------------------------------------------------
# AC03 — Output written as MP4
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_output_written_as_mp4(tmp_path, monkeypatch):
    """run_inference saves video output to OUTPUT_DIR/<jobId>.mp4."""
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    mock_save = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.wan_image_to_video",
            return_value=(MagicMock(), MagicMock(), {}),
        ),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=MagicMock()),
        patch("parallax_worker.tasks.save_video", mock_save),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2vid_request(job_id="job-mp4"))

    mock_save.assert_called_once()
    saved_path = mock_save.call_args.args[1]
    assert saved_path.endswith("job-mp4.mp4")


# ---------------------------------------------------------------------------
# AC04 — Worker POSTs {id, url} with MP4 URL to gateway callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac04_success_callback_contains_mp4_url(tmp_path, monkeypatch):
    """On successful txt2vid, worker POSTs {id, url} where url ends in .mp4."""
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.wan_image_to_video",
            return_value=(MagicMock(), MagicMock(), {}),
        ),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=MagicMock()),
        patch("parallax_worker.tasks.save_video"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2vid_request(job_id="j-vid-ok"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-vid-ok"
    assert "url" in payload
    assert payload["url"].endswith(".mp4")
    assert "error" not in payload


# ---------------------------------------------------------------------------
# AC07 — Error propagation: job transitions to failed with error field
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac07_wan_error_posts_error_callback():
    """run_inference posts error callback when wan_image_to_video raises."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.wan_image_to_video",
            side_effect=RuntimeError("VRAM exhausted"),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2vid_request(job_id="j-vid-err"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-vid-err"
    assert "error" in payload
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac07_sample_error_posts_error_callback():
    """run_inference posts error callback when sample raises during txt2vid."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.wan_image_to_video",
            return_value=(MagicMock(), MagicMock(), {}),
        ),
        patch("parallax_worker.tasks.sample", side_effect=RuntimeError("GPU OOM")),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_txt2vid_request(job_id="j-vid-oom"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-vid-oom"
    assert "error" in payload
    assert "url" not in payload


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
