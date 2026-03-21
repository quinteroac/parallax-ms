"""US-004 acceptance: generated image served and URL included in callback."""

import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from parallax_worker.main import app
from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


client = TestClient(app)


# AC01 — Worker serves output images as static files
def test_ac01_get_assets_returns_png_file(tmp_path):
    """GET /assets/{filename} returns the PNG file from OUTPUT_DIR."""
    png_bytes = _minimal_png()
    filename = "test-job-001.png"
    (tmp_path / filename).write_bytes(png_bytes)

    with patch.dict("os.environ", {"OUTPUT_DIR": str(tmp_path)}):
        res = client.get(f"/assets/{filename}")

    assert res.status_code == 200
    assert res.headers["content-type"] == "image/png"
    assert res.content == png_bytes


def test_ac01_get_assets_returns_404_for_missing_file(tmp_path):
    """GET /assets/{filename} returns 404 when file does not exist."""
    with patch.dict("os.environ", {"OUTPUT_DIR": str(tmp_path)}):
        res = client.get("/assets/nonexistent.png")

    assert res.status_code == 404


# AC02 — After saving image, worker POSTs { id, url } to /worker/done
@pytest.mark.anyio
async def test_ac02_callback_url_uses_gateway_callback_url():
    """run_inference constructs the asset URL from GATEWAY_CALLBACK_URL."""
    mock_image = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch.dict(
            "os.environ",
            {"GATEWAY_CALLBACK_URL": "http://gateway.internal:3000"},
        ),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(InferRequest(id="job-ac02", prompt="a cat"))

    call_args = mock_post.call_args
    posted_url = call_args.kwargs["json"]["url"]
    assert posted_url == "http://gateway.internal:3000/outputs/job-ac02.png"


@pytest.mark.anyio
async def test_ac02_callback_url_defaults_to_localhost_3000():
    """run_inference defaults GATEWAY_CALLBACK_URL to http://localhost:3000."""
    mock_image = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch.dict("os.environ", {}, clear=False),
    ):
        import os

        env_backup = os.environ.pop("GATEWAY_CALLBACK_URL", None)
        try:
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = mock_post
            mock_client_cls.return_value = mock_client

            await run_inference(InferRequest(id="job-default", prompt="sunset"))
        finally:
            if env_backup is not None:
                os.environ["GATEWAY_CALLBACK_URL"] = env_backup

    call_args = mock_post.call_args
    posted_url = call_args.kwargs["json"]["url"]
    assert posted_url.startswith("http://localhost:3000/outputs/")
    assert "job-default.png" in posted_url


# AC04 — Image URL is reachable via HTTP and returns the PNG file
def test_ac04_asset_url_returns_png_content_type(tmp_path):
    """Asset endpoint returns image/png content-type for valid PNG files."""
    png_bytes = _minimal_png()
    job_id = "job-ac04"
    (tmp_path / f"{job_id}.png").write_bytes(png_bytes)

    with patch.dict("os.environ", {"OUTPUT_DIR": str(tmp_path)}):
        res = client.get(f"/assets/{job_id}.png")

    assert res.status_code == 200
    assert "image/png" in res.headers["content-type"]
    assert res.content[:8] == b"\x89PNG\r\n\x1a\n"


# AC05 — Ruff lint passes
def test_ac05_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _minimal_png() -> bytes:
    """Return the smallest valid PNG (1x1 transparent pixel)."""
    import zlib

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = zlib.crc32(tag + data) & 0xFFFFFFFF
        return len(data).to_bytes(4, "big") + tag + data + c.to_bytes(4, "big")

    signature = b"\x89PNG\r\n\x1a\n"
    ihdr = chunk(b"IHDR", b"\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00")
    idat = chunk(b"IDAT", zlib.compress(b"\x00\xff\xff\xff"))
    iend = chunk(b"IEND", b"")
    return signature + ihdr + idat + iend
