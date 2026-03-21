"""Background inference task for the Parallax worker."""

import logging
import os
from pathlib import Path

import httpx
from comfy_diffusion import vae_decode
from comfy_diffusion.conditioning import encode_prompt
from comfy_diffusion.latent import empty_latent_image
from comfy_diffusion.sampling import sample

from parallax_worker.models import InferRequest
from parallax_worker.startup import get_checkpoint

logger = logging.getLogger(__name__)


async def run_inference(request: InferRequest) -> None:
    """Run txt2img inference and POST the result or error to the gateway callback."""
    callback_base = os.getenv("GATEWAY_CALLBACK_URL", "http://localhost:3000")
    callback_url = f"{callback_base}/worker/done"

    try:
        checkpoint = get_checkpoint()
        model = checkpoint.model
        clip = checkpoint.clip
        vae = checkpoint.vae

        # Full pipeline using validated request parameters
        positive = encode_prompt(clip, request.prompt)
        negative = encode_prompt(clip, request.negative_prompt)
        latent = empty_latent_image(request.width, request.height)
        denoised = sample(
            model,
            positive,
            negative,
            latent,
            request.steps,
            request.cfg,
            request.sampler_name,
            request.scheduler,
            request.seed,
        )
        image = vae_decode(vae, denoised)

        # Save artifact to disk
        output_dir = Path(os.getenv("OUTPUT_DIR", "./outputs"))
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / f"{request.id}.png"
        image.save(str(output_path))

        url = f"{callback_base}/outputs/{request.id}.png"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(callback_url, json={"id": request.id, "url": url})
                response.raise_for_status()
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to POST to gateway callback %s: %s", callback_url, exc)

    except Exception as exc:  # noqa: BLE001
        logger.error("Inference failed for job %s: %s", request.id, exc)
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                await client.post(callback_url, json={"id": request.id, "error": str(exc)})
        except Exception as cb_exc:  # noqa: BLE001
            logger.error("Failed to POST error callback to %s: %s", callback_url, cb_exc)
