"""it_000008 US-004: Worker runs img2vid inference end-to-end."""

import base64
import io
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image as PILImage

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_png_b64() -> str:
    """Return a minimal 1×1 PNG as a base64 string."""
    img = PILImage.new("RGB", (1, 1), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_img2vid_request(job_id: str = "j-img2vid", **kwargs) -> InferRequest:
    defaults: dict = {
        "prompt": "the image comes to life",
        "modality": "img2vid",
        "architecture": "separate-diffusion-model",
        "components": {
            "diffusion_model": "wan_video_i2v_14b.safetensors",
            "vae": "wan_video_vae.safetensors",
            "text_encoder": "umt5_xxl.safetensors",
        },
        "source_image": _make_png_b64(),
        "width": 832,
        "height": 480,
        "duration": 2.0,
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
# AC01 — POST /infer accepts img2vid modality with required fields
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_img2vid_modality():
    """InferRequest accepts modality='img2vid'."""
    req = _make_img2vid_request()
    assert req.modality == "img2vid"


def test_ac01_infer_request_accepts_source_image():
    """InferRequest stores source_image for img2vid."""
    b64 = _make_png_b64()
    req = _make_img2vid_request(source_image=b64)
    assert req.source_image == b64


def test_ac01_infer_request_accepts_width_height_duration():
    """InferRequest accepts width, height, and duration for img2vid."""
    req = _make_img2vid_request(width=1280, height=720, duration=4.0)
    assert req.width == 1280
    assert req.height == 720
    assert req.duration == 4.0


def test_ac01_post_infer_img2vid_returns_202():
    """POST /infer with modality=img2vid responds 202 Accepted."""
    from fastapi.testclient import TestClient

    from parallax_worker.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/infer",
        json={
            "id": "j-img2vid-202",
            "prompt": "animate it",
            "modality": "img2vid",
            "architecture": "separate-diffusion-model",
            "components": {
                "diffusion_model": "wan_video_i2v_14b.safetensors",
                "vae": "wan_video_vae.safetensors",
                "text_encoder": "umt5_xxl.safetensors",
            },
            "source_image": _make_png_b64(),
            "width": 832,
            "height": 480,
            "duration": 2.0,
        },
    )
    assert response.status_code == 202


# ---------------------------------------------------------------------------
# AC02 — Inference runs asynchronously using comfy_diffusion exclusively
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_img2vid_calls_wan_image_to_video_with_start_image():
    """run_inference calls wan_image_to_video with start_image for img2vid."""
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()) as mock_tensor,
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        req = _make_img2vid_request(width=832, height=480, duration=2.0)
        await run_inference(req)

    mock_wan.assert_called_once()
    call_kwargs = mock_wan.call_args.kwargs
    assert call_kwargs["width"] == 832
    assert call_kwargs["height"] == 480
    # duration=2.0 * video_fps=16 → length=32
    assert call_kwargs["length"] == 32
    # start_image must be passed (the tensor returned by image_to_tensor)
    assert call_kwargs["start_image"] is mock_tensor.return_value


@pytest.mark.anyio
async def test_ac02_img2vid_calls_sample_with_wan_latent():
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request())

    mock_sample.assert_called_once()
    # sample(model, positive, negative, latent, ...) — latent is the 4th positional arg
    assert mock_sample.call_args.args[3] is fake_latent


# ---------------------------------------------------------------------------
# AC03 — Output is written as an MP4 file
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_output_written_as_mp4(tmp_path, monkeypatch):
    """run_inference saves video output to OUTPUT_DIR/<jobId>.mp4 for img2vid."""
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request(job_id="job-i2v-mp4"))

    mock_save.assert_called_once()
    saved_path = mock_save.call_args.args[1]
    assert saved_path.endswith("job-i2v-mp4.mp4")


# ---------------------------------------------------------------------------
# AC04 — Worker POSTs {id, url} with MP4 URL to gateway callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac04_success_callback_contains_mp4_url(tmp_path, monkeypatch):
    """On successful img2vid, worker POSTs {id, url} where url ends in .mp4."""
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request(job_id="j-i2v-ok"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-i2v-ok"
    assert "url" in payload
    assert payload["url"].endswith(".mp4")
    assert "error" not in payload


# ---------------------------------------------------------------------------
# AC05 / AC06 — Gateway updates job to succeeded with MP4 url
#   (covered by existing worker-callback.test.ts; verified here via callback payload)
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac05_ac06_callback_payload_has_id_and_mp4_url(tmp_path, monkeypatch):
    """Callback payload carries id and .mp4 url so gateway can set succeeded + url."""
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request(job_id="j-gateway-check"))

    payload = mock_post.call_args.kwargs["json"]
    assert "id" in payload
    assert "url" in payload
    assert payload["url"].endswith(".mp4")


# ---------------------------------------------------------------------------
# AC07 — Error propagation: job transitions to failed with error field
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac07_missing_source_image_posts_error_callback():
    """run_inference posts error callback when source_image is None for img2vid."""
    mock_post = AsyncMock(return_value=MagicMock())
    mock_client = _patch_httpx_client(mock_post)

    req = InferRequest(
        id="j-no-image",
        prompt="test",
        modality="img2vid",
        source_image=None,
    )

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(req)

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-no-image"
    assert "error" in payload
    assert "url" not in payload


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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request(job_id="j-i2v-err"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-i2v-err"
    assert "error" in payload
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac07_sample_error_posts_error_callback():
    """run_inference posts error callback when sample raises during img2vid."""
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
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_cls.return_value = mock_client
        await run_inference(_make_img2vid_request(job_id="j-i2v-oom"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-i2v-oom"
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
