"""US-005 acceptance: stub worker accepts infer requests and runs a background task."""

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


# AC01 — Pydantic model validates body fields
def test_ac01_infer_request_model_validates_fields():
    req = InferRequest(id="job-1", type="txt2img", params={"prompt": "a cat"})
    assert req.id == "job-1"
    assert req.type == "txt2img"
    assert req.params == {"prompt": "a cat"}


def test_ac01_infer_request_rejects_missing_fields():
    with pytest.raises(Exception):
        InferRequest(id="job-1")  # type and params missing


# AC02 — POST /infer returns 202 with {"message": "accepted"}
def test_ac02_post_infer_returns_202_accepted():
    response = client.post(
        "/infer",
        json={"id": "job-abc", "type": "txt2img", "params": {"prompt": "sunset"}},
    )
    assert response.status_code == 202
    assert response.json() == {"message": "accepted"}


# AC03 — Background task POSTs {id, url} to gateway callback
@pytest.mark.anyio
async def test_ac03_background_task_posts_to_gateway():
    mock_response = MagicMock()
    mock_post = AsyncMock(return_value=mock_response)

    with (
        patch("parallax_worker.tasks.asyncio.sleep", new=AsyncMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference("job-123")

    mock_post.assert_awaited_once()
    call_args = mock_post.call_args
    assert call_args.kwargs["json"]["id"] == "job-123"
    assert "job-123.png" in call_args.kwargs["json"]["url"]
    assert "/worker/done" in call_args.args[0]


# AC04 — Gateway callback unreachable: logs error, does not crash
@pytest.mark.anyio
async def test_ac04_unreachable_gateway_logs_error_no_crash():
    with (
        patch("parallax_worker.tasks.asyncio.sleep", new=AsyncMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.logger") as mock_logger,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(side_effect=ConnectionError("refused"))
        mock_client_cls.return_value = mock_client

        # Should not raise
        await run_inference("job-err")

    mock_logger.error.assert_called_once()


# AC05 — Health endpoint still returns 200 while a background task is running
def test_ac05_health_returns_200_with_background_task_running():
    # Start an infer request (triggers background task)
    client.post(
        "/infer",
        json={"id": "job-health", "type": "txt2img", "params": {}},
    )
    # Health must still respond immediately
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# AC06 — Ruff lint passes
def test_ac06_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
