"""US-007: Automated end-to-end test for the full inference path.

Skipped automatically when MODELS_DIR / CHECKPOINT_FILENAME are not set (AC04),
allowing CI runs without GPU or model files (AC05).
"""

import os
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from parallax_worker.main import app

# AC04: skip when model env vars are absent (covers AC05 — clean CI environments)
pytestmark = pytest.mark.skipif(
    not os.getenv("MODELS_DIR") or not os.getenv("CHECKPOINT_FILENAME"),
    reason="MODELS_DIR and CHECKPOINT_FILENAME not set — skipping GPU/model E2E test",
)


def test_e2e_txt2img_creates_png_and_posts_callback_url():
    """Full inference path: POST /infer → real inference → PNG on disk → callback with url.

    AC01: submits a minimal txt2img request via POST /infer.
    AC02: asserts the output PNG is created on disk (no polling needed — TestClient
          runs background tasks synchronously before client.post() returns).
    AC03: asserts the callback payload contains a valid 'url' field.
    """
    job_id = "e2e-us007-001"
    captured_callbacks: list[dict] = []

    async def fake_post(url, *, json=None, **kwargs):
        captured_callbacks.append({"callback_url": url, "payload": json})
        resp = MagicMock()
        resp.raise_for_status.return_value = None
        return resp

    with tempfile.TemporaryDirectory() as tmpdir:
        with (
            patch.dict(
                os.environ,
                {
                    "OUTPUT_DIR": tmpdir,
                    "GATEWAY_CALLBACK_URL": "http://localhost:3000",
                },
            ),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        ):
            mock_async_client = AsyncMock()
            mock_async_client.__aenter__ = AsyncMock(return_value=mock_async_client)
            mock_async_client.__aexit__ = AsyncMock(return_value=False)
            mock_async_client.post = AsyncMock(side_effect=fake_post)
            mock_client_cls.return_value = mock_async_client

            # TestClient triggers the app lifespan, which calls bootstrap() to load
            # the real model checkpoint (requires MODELS_DIR + CHECKPOINT_FILENAME).
            with TestClient(app) as http_client:
                # AC01: submit a minimal txt2img request directly to POST /infer
                response = http_client.post(
                    "/infer",
                    json={"id": job_id, "prompt": "a small red circle"},
                )
            # Background task completes before TestClient.post() returns.

        # AC01: endpoint accepted the request
        assert response.status_code == 202

        # AC02: output PNG exists on disk (within synchronous test execution)
        output_file = Path(tmpdir) / f"{job_id}.png"
        assert output_file.exists(), (
            f"Expected PNG at {output_file}. "
            "Inference may have failed — check worker logs for errors."
        )
        assert output_file.stat().st_size > 0, "PNG file was created but is empty"

        # AC03: callback payload contains a valid url field
        assert captured_callbacks, "No callback was posted to the gateway"
        payload = captured_callbacks[0]["payload"]
        assert "url" in payload, f"Callback payload missing 'url' key: {payload}"
        assert job_id in payload["url"], (
            f"Callback URL does not reference the job ID: {payload['url']}"
        )
        assert payload["url"].endswith(".png"), (
            f"Callback URL does not end with .png: {payload['url']}"
        )
        assert "error" not in payload, f"Unexpected error in callback payload: {payload}"
