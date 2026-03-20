"""Background inference task for the Parallax worker."""

import asyncio
import logging
import os

import httpx

logger = logging.getLogger(__name__)

INFER_DELAY_SECONDS = 2


async def run_inference(job_id: str) -> None:
    """Simulate inference and POST the result to the gateway callback."""
    await asyncio.sleep(INFER_DELAY_SECONDS)

    url = f"http://localhost/assets/{job_id}.png"
    callback_base = os.getenv("GATEWAY_CALLBACK_URL", "http://localhost:3000")
    callback_url = f"{callback_base}/worker/done"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(callback_url, json={"id": job_id, "url": url})
            response.raise_for_status()
    except Exception as exc:  # noqa: BLE001
        logger.error("Failed to POST to gateway callback %s: %s", callback_url, exc)
