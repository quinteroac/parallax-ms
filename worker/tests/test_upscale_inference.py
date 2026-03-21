"""US-003 (it_000007) acceptance: worker runs upscale inference end-to-end."""

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


def _make_png_b64(width: int = 8, height: int = 8) -> str:
    """Return a base64-encoded PNG string."""
    img = PILImage.new("RGB", (width, height), color=(100, 150, 200))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_upscale_request(job_id: str = "j-upscale", **kwargs) -> InferRequest:
    return InferRequest(
        id=job_id,
        prompt="",
        modality="upscale",
        architecture="bundled-checkpoint",
        components={"checkpoint": "4x-UltraSharp.pth"},
        source_image=_make_png_b64(),
        **kwargs,
    )


def _mock_output_tensor():
    """Return a fake BHWC float32 tensor (1, 16, 16, 3) as a MagicMock."""
    import numpy as np

    arr = (np.zeros((1, 16, 16, 3), dtype=np.float32) + 0.5)

    class _FakeTensor:
        def __getitem__(self, idx):
            return _FakeSlice(arr[idx])

    class _FakeSlice:
        def __init__(self, data):
            self._data = data

        def cpu(self):
            return self

        def float(self):
            return self

        def numpy(self):
            return self._data

    return _FakeTensor()


# ---------------------------------------------------------------------------
# AC01 — POST /infer with modality=upscale returns 202 and starts background task
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_upscale_modality():
    """InferRequest accepts modality='upscale'."""
    req = _make_upscale_request()
    assert req.modality == "upscale"


def test_ac01_infer_request_source_image_field_present():
    """InferRequest has a source_image field (AC-06)."""
    req = _make_upscale_request()
    assert req.source_image is not None


def test_ac01_post_infer_upscale_returns_202():
    """POST /infer with modality=upscale responds 202 and runs background inference."""
    from fastapi.testclient import TestClient

    from parallax_worker.main import app

    client = TestClient(app, raise_server_exceptions=False)
    response = client.post(
        "/infer",
        json={
            "id": "j-upscale-202",
            "prompt": "",
            "modality": "upscale",
            "architecture": "bundled-checkpoint",
            "components": {"checkpoint": "4x-UltraSharp.pth"},
            "source_image": _make_png_b64(),
        },
    )

    assert response.status_code == 202


# ---------------------------------------------------------------------------
# AC02 — Inference calls image_upscale_with_model with decoded image and upscaler
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_upscale_calls_image_upscale_with_model():
    """run_inference calls image_upscale_with_model with the upscale model and image tensor."""
    mock_upscale_fn = MagicMock(return_value=_mock_output_tensor())
    mock_manager = MagicMock()
    mock_upscale_model = MagicMock()
    mock_manager.load_upscale_model.return_value = mock_upscale_model
    fake_tensor = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager", return_value=mock_manager),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.image_to_tensor", return_value=fake_tensor),
        patch("parallax_worker.tasks.image_upscale_with_model", mock_upscale_fn),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(_make_upscale_request())

    mock_upscale_fn.assert_called_once_with(mock_upscale_model, fake_tensor)


@pytest.mark.anyio
async def test_ac02_upscale_loads_upscale_model_from_components():
    """run_inference loads the upscaler using components['checkpoint']."""
    mock_manager = MagicMock()
    mock_manager.load_upscale_model.return_value = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager", return_value=mock_manager),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.image_upscale_with_model",
            return_value=_mock_output_tensor(),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(_make_upscale_request())

    mock_manager.load_upscale_model.assert_called_once_with("4x-UltraSharp.pth")


# ---------------------------------------------------------------------------
# AC03 — Output image written to OUTPUT_DIR/<jobId>.png
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_output_written_to_output_dir(tmp_path, monkeypatch):
    """run_inference saves the upscaled image to OUTPUT_DIR/<jobId>.png."""
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    mock_manager = MagicMock()
    mock_manager.load_upscale_model.return_value = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager", return_value=mock_manager),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.image_upscale_with_model",
            return_value=_mock_output_tensor(),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        req = _make_upscale_request(job_id="job-xyz")
        await run_inference(req)

    assert (tmp_path / "job-xyz.png").exists()


# ---------------------------------------------------------------------------
# AC04 — On success: POSTs {id, url} to callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac04_success_callback_contains_url(tmp_path, monkeypatch):
    """On successful upscale, worker POSTs {id, url} to gateway callback."""
    monkeypatch.setenv("OUTPUT_DIR", str(tmp_path))
    mock_post = AsyncMock(return_value=MagicMock())
    mock_manager = MagicMock()
    mock_manager.load_upscale_model.return_value = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager", return_value=mock_manager),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.image_upscale_with_model",
            return_value=_mock_output_tensor(),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(_make_upscale_request(job_id="j-success"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-success"
    assert "url" in payload
    assert "error" not in payload


# ---------------------------------------------------------------------------
# AC05 — On failure: POSTs {id, error} to callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac05_missing_source_image_posts_error_callback():
    """run_inference posts error callback when source_image is absent for upscale."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-no-src",
                prompt="",
                modality="upscale",
                components={"checkpoint": "4x-UltraSharp.pth"},
                # source_image intentionally omitted
            )
        )

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-no-src"
    assert "error" in payload
    assert "source_image" in payload["error"]
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac05_invalid_source_image_posts_error_callback():
    """run_inference posts error callback when source_image is invalid base64."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-bad-b64",
                prompt="",
                modality="upscale",
                components={"checkpoint": "4x-UltraSharp.pth"},
                source_image="!!!not-valid-base64!!!",
            )
        )

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-bad-b64"
    assert "error" in payload
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac05_inference_error_posts_error_callback():
    """run_inference posts error callback when image_upscale_with_model raises."""
    mock_post = AsyncMock()
    mock_manager = MagicMock()
    mock_manager.load_upscale_model.return_value = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager", return_value=mock_manager),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.image_to_tensor", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.image_upscale_with_model",
            side_effect=RuntimeError("GPU OOM"),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(_make_upscale_request(job_id="j-fail"))

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-fail"
    assert "error" in payload
    assert "url" not in payload


# ---------------------------------------------------------------------------
# AC06 — InferRequest accepts source_image
# ---------------------------------------------------------------------------


def test_ac06_infer_request_source_image_is_optional():
    """InferRequest accepts source_image as an optional field (defaults to None)."""
    req = InferRequest(id="j1", prompt="test")
    assert req.source_image is None


def test_ac06_infer_request_source_image_accepts_string():
    """InferRequest accepts a base64 string for source_image."""
    req = InferRequest(id="j1", prompt="test", source_image=_make_png_b64())
    assert isinstance(req.source_image, str)


# ---------------------------------------------------------------------------
# AC07 — Typecheck / lint passes
# ---------------------------------------------------------------------------


def test_ac07_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
