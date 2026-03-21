"""US-005 acceptance: worker inference errors propagate as failed job state."""

import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# AC01 — inference exception triggers error callback POST with {id, error}
@pytest.mark.anyio
async def test_ac01_inference_exception_posts_error_callback():
    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch(
            "parallax_worker.tasks.encode_prompt",
            side_effect=RuntimeError("CUDA out of memory"),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_post = AsyncMock()
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(InferRequest(id="job-err", prompt="a cat"))

    mock_post.assert_awaited_once()
    call_args = mock_post.call_args
    assert call_args.kwargs["json"]["id"] == "job-err"
    assert "CUDA out of memory" in call_args.kwargs["json"]["error"]
    assert "url" not in call_args.kwargs["json"]


# AC01 — error callback is POSTed to the /worker/done endpoint
@pytest.mark.anyio
async def test_ac01_error_callback_posted_to_worker_done_endpoint():
    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch(
            "parallax_worker.tasks.encode_prompt",
            side_effect=ValueError("bad prompt"),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_post = AsyncMock()
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(InferRequest(id="job-fail", prompt="test"))

    call_args = mock_post.call_args
    assert "/worker/done" in call_args.args[0]


# AC04 — no silent hang: callback always sent; if callback also fails, function still returns
@pytest.mark.anyio
async def test_ac04_no_silent_hang_even_if_error_callback_unreachable():
    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch(
            "parallax_worker.tasks.encode_prompt",
            side_effect=RuntimeError("inference failed"),
        ),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.logger") as mock_logger,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=ConnectionError("refused"))
        mock_client_cls.return_value = mock_client

        # Must not raise even when both inference and callback fail
        await run_inference(InferRequest(id="job-hang", prompt="test"))

    assert mock_logger.error.call_count >= 1


# AC05 — ruff lint passes on modified task module
def test_ac05_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
