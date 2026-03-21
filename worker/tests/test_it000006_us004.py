"""US-004 (it_000006) acceptance: txt2img end-to-end verified."""

import subprocess
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# AC01 — InferRequest accepts modality=txt2img with at minimum a prompt
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_txt2img_modality():
    """InferRequest accepts modality='txt2img'."""
    req = InferRequest(id="j1", prompt="a serene landscape", modality="txt2img")
    assert req.modality == "txt2img"


def test_ac01_infer_request_requires_prompt_at_minimum():
    """InferRequest requires at minimum a prompt field."""
    req = InferRequest(id="j1", prompt="mountains and sky", modality="txt2img")
    assert req.prompt == "mountains and sky"


def test_ac01_infer_request_accepts_full_job_payload():
    """InferRequest accepts a realistic txt2img payload from the gateway."""
    req = InferRequest(
        id="us004-job",
        prompt="a serene landscape with mountains",
        modality="txt2img",
        modelId="wai-illustrious-sdxl-v160",
        architecture="bundled-checkpoint",
        components={"checkpoint": "waiIllustriousSDXL_v160.safetensors"},
        width=1024,
        height=1024,
        steps=30,
        cfg=7.0,
        seed=42,
    )
    assert req.modality == "txt2img"
    assert req.modelId == "wai-illustrious-sdxl-v160"
    assert req.architecture == "bundled-checkpoint"


# ---------------------------------------------------------------------------
# AC02 — Worker infers, writes PNG to OUTPUT_DIR, POSTs {id, url} to /worker/done
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_txt2img_writes_png_to_output_dir():
    """run_inference for txt2img writes {id}.png to OUTPUT_DIR."""
    mock_image = MagicMock()

    with tempfile.TemporaryDirectory() as tmp:
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
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_client_cls.return_value = mock_client

            await run_inference(
                InferRequest(
                    id="us004-png-job",
                    prompt="a serene landscape",
                    modality="txt2img",
                    modelId="wai-illustrious-sdxl-v160",
                    architecture="bundled-checkpoint",
                    components={"checkpoint": "waiIllustriousSDXL_v160.safetensors"},
                )
            )

        expected = Path(tmp) / "us004-png-job.png"
        mock_image.save.assert_called_once_with(str(expected))


@pytest.mark.anyio
async def test_ac02_txt2img_posts_success_callback_to_worker_done():
    """run_inference for txt2img POSTs {id, url} to /worker/done."""
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
        patch.dict("os.environ", {"GATEWAY_CALLBACK_URL": "http://localhost:3000"}),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="us004-cb-job",
                prompt="a serene landscape",
                modality="txt2img",
                modelId="wai-illustrious-sdxl-v160",
                architecture="bundled-checkpoint",
                components={"checkpoint": "waiIllustriousSDXL_v160.safetensors"},
            )
        )

    mock_post.assert_awaited_once()
    call_args = mock_post.call_args
    assert call_args.args[0] == "http://localhost:3000/worker/done"
    payload = call_args.kwargs["json"]
    assert payload["id"] == "us004-cb-job"
    assert "url" in payload
    assert "us004-cb-job.png" in payload["url"]
    assert "error" not in payload


@pytest.mark.anyio
async def test_ac02_txt2img_uses_empty_latent_not_vae_encode():
    """txt2img path uses empty_latent_image, not vae_encode."""
    mock_image = MagicMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch(
            "parallax_worker.tasks.empty_latent_image", return_value=MagicMock()
        ) as mock_empty,
        patch("parallax_worker.tasks.vae_encode") as mock_vae_encode,
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(id="us004-latent-job", prompt="a meadow", modality="txt2img")
        )

    mock_empty.assert_called_once()
    mock_vae_encode.assert_not_called()


@pytest.mark.anyio
async def test_ac02_txt2img_calls_sample_with_denoise_1_0():
    """txt2img calls sample() with denoise=1.0."""
    mock_image = MagicMock()
    mock_sample = MagicMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", mock_sample),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(id="us004-denoise-job", prompt="a sunset", modality="txt2img")
        )

    call_kwargs = mock_sample.call_args.kwargs
    assert call_kwargs.get("denoise") == 1.0


# ---------------------------------------------------------------------------
# AC05 — Ruff check passes
# ---------------------------------------------------------------------------


def test_ac05_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
