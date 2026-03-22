"""Background inference task for the Parallax worker."""

import logging
import os
from pathlib import Path

import httpx
from comfy_diffusion.models import ModelManager

from parallax_worker.handlers.registry import REGISTRY
from parallax_worker.models import InferRequest

logger = logging.getLogger(__name__)


async def run_inference(request: InferRequest) -> None:
    """Run inference and POST result or error to gateway callback."""
    callback_base = os.getenv("GATEWAY_CALLBACK_URL", "http://localhost:3000")
    callback_url = f"{callback_base}/worker/done"

    logger.info("Starting inference  job=%s modality=%s model=%s", request.id, request.modality, request.modelId)

    try:
        models_dir = os.environ.get("MODELS_DIR", "/mnt/models/comfyui")
        manager = ModelManager(models_dir)

        output_dir = Path(os.getenv("OUTPUT_DIR", "./outputs"))
        output_dir.mkdir(parents=True, exist_ok=True)

        handler = REGISTRY.get(request.modality)
        if handler is None:
            raise ValueError(
                f"Unsupported modality '{request.modality}'. "
                "Supported: txt2img, img2img, upscale, txt2vid, img2vid."
            )

        url = await handler.run(request, manager, output_dir, callback_base)
        logger.info("Inference complete job=%s url=%s", request.id, url)

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(callback_url, json={"id": request.id, "url": url})
                response.raise_for_status()
            logger.info("Callback delivered job=%s", request.id)
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to POST to gateway callback %s: %s", callback_url, exc)

    except Exception as exc:  # noqa: BLE001
        logger.error("Inference failed for job %s: %s", request.id, exc)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(callback_url, json={"id": request.id, "error": str(exc)})
        except Exception as cb_exc:  # noqa: BLE001
            logger.error("Failed to POST error callback to %s: %s", callback_url, cb_exc)
