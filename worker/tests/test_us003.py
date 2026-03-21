"""US-003 acceptance: txt2img inference writes artifact to disk."""

import subprocess
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


def _make_mock_checkpoint():
    """Return a MagicMock that mimics a CheckpointResult."""
    checkpoint = MagicMock()
    checkpoint.model = MagicMock()
    checkpoint.clip = MagicMock()
    checkpoint.vae = MagicMock()
    return checkpoint


# ---------------------------------------------------------------------------
# AC01 — full pipeline: encode_prompt × 2 → empty_latent_image → sample → vae_decode → save
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac01_full_pipeline_runs_in_order():
    """All pipeline steps are called in the correct order."""
    checkpoint = _make_mock_checkpoint()
    mock_image = MagicMock()
    call_order = []

    def track(name):
        def fn(*args, **kwargs):
            call_order.append(name)
            return MagicMock()

        return fn

    mock_encode = MagicMock(side_effect=track("encode_prompt"))
    mock_latent = MagicMock(side_effect=track("empty_latent_image"))
    mock_sample = MagicMock(side_effect=track("sample"))

    def _vae_decode(*a, **kw):
        call_order.append("vae_decode")
        return mock_image

    mock_vae_decode = MagicMock(side_effect=_vae_decode)

    request = InferRequest(id="job-01", prompt="a sunrise", negative_prompt="blurry")

    with tempfile.TemporaryDirectory() as tmp:
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(checkpoint.model, checkpoint.clip, checkpoint.vae),
            ),
            patch("parallax_worker.tasks.encode_prompt", mock_encode),
            patch("parallax_worker.tasks.empty_latent_image", mock_latent),
            patch("parallax_worker.tasks.sample", mock_sample),
            patch("parallax_worker.tasks.vae_decode", mock_vae_decode),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_http,
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_http.return_value = mock_client

            await run_inference(request)

    expected = ["encode_prompt", "encode_prompt", "empty_latent_image", "sample", "vae_decode"]
    assert call_order == expected


@pytest.mark.anyio
async def test_ac01_encode_prompt_called_for_positive_and_negative():
    """encode_prompt is called once for the positive prompt and once for the negative."""
    checkpoint = _make_mock_checkpoint()
    mock_image = MagicMock()
    mock_encode = MagicMock(return_value=MagicMock())

    request = InferRequest(id="job-02", prompt="a dog", negative_prompt="ugly")

    with tempfile.TemporaryDirectory() as tmp:
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(checkpoint.model, checkpoint.clip, checkpoint.vae),
            ),
            patch("parallax_worker.tasks.encode_prompt", mock_encode),
            patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
            patch("parallax_worker.tasks.sample", return_value=MagicMock()),
            patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_http,
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_http.return_value = mock_client

            await run_inference(request)

    assert mock_encode.call_count == 2
    encode_texts = [c.args[1] for c in mock_encode.call_args_list]
    assert "a dog" in encode_texts
    assert "ugly" in encode_texts


# ---------------------------------------------------------------------------
# AC02 — sample() uses sampler_name, scheduler, steps, cfg, and seed from request
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_sample_called_with_request_parameters():
    """sample() receives all sampling parameters from the validated request."""
    checkpoint = _make_mock_checkpoint()
    mock_image = MagicMock()
    mock_sample = MagicMock(return_value=MagicMock())

    request = InferRequest(
        id="job-03",
        prompt="mountains",
        steps=30,
        cfg=8.5,
        sampler_name="dpm_2",
        scheduler="karras",
        seed=42,
    )

    with tempfile.TemporaryDirectory() as tmp:
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(checkpoint.model, checkpoint.clip, checkpoint.vae),
            ),
            patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
            patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
            patch("parallax_worker.tasks.sample", mock_sample),
            patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_http,
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_http.return_value = mock_client

            await run_inference(request)

    _, call_kwargs = mock_sample.call_args
    call_positional = mock_sample.call_args.args
    # sample(model, positive, negative, latent, steps, cfg, sampler_name, scheduler, seed)
    assert call_positional[4] == 30
    assert call_positional[5] == 8.5
    assert call_positional[6] == "dpm_2"
    assert call_positional[7] == "karras"
    assert call_positional[8] == 42


# ---------------------------------------------------------------------------
# AC03 — output file exists on disk after the background task completes
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_output_file_exists_after_task():
    """The generated PNG is saved to OUTPUT_DIR/{job_id}.png."""
    checkpoint = _make_mock_checkpoint()
    mock_image = MagicMock()

    request = InferRequest(id="job-04", prompt="galaxy")

    with tempfile.TemporaryDirectory() as tmp:
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(checkpoint.model, checkpoint.clip, checkpoint.vae),
            ),
            patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
            patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
            patch("parallax_worker.tasks.sample", return_value=MagicMock()),
            patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_http,
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_http.return_value = mock_client

            await run_inference(request)

        expected_path = Path(tmp) / "job-04.png"
        mock_image.save.assert_called_once_with(str(expected_path))


@pytest.mark.anyio
async def test_ac03_output_dir_is_created_if_missing():
    """OUTPUT_DIR is created automatically when it does not exist."""
    checkpoint = _make_mock_checkpoint()
    mock_image = MagicMock()

    request = InferRequest(id="job-05", prompt="ocean")

    with tempfile.TemporaryDirectory() as tmp:
        nested = str(Path(tmp) / "deep" / "nested" / "dir")
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(checkpoint.model, checkpoint.clip, checkpoint.vae),
            ),
            patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
            patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
            patch("parallax_worker.tasks.sample", return_value=MagicMock()),
            patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_http,
            patch.dict("os.environ", {"OUTPUT_DIR": nested}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_http.return_value = mock_client

            await run_inference(request)

        assert Path(nested).exists()


# ---------------------------------------------------------------------------
# AC04 — Typecheck / lint passes
# ---------------------------------------------------------------------------


def test_ac04_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
