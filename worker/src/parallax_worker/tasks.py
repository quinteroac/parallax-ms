"""Background inference task for the Parallax worker."""

import base64
import io
import logging
import os
from pathlib import Path

import httpx
import numpy as np
from comfy_diffusion import vae_decode
from comfy_diffusion.conditioning import encode_prompt, wan_image_to_video
from comfy_diffusion.image import image_to_tensor, image_upscale_with_model
from comfy_diffusion.latent import empty_latent_image
from comfy_diffusion.models import ModelManager
from comfy_diffusion.sampling import sample
from comfy_diffusion.vae import vae_encode
from comfy_diffusion.video import save_video
from PIL import Image as PILImage

from parallax_worker.models import InferRequest

logger = logging.getLogger(__name__)

_SUPPORTED_ARCHITECTURES = frozenset(
    {
        "bundled-checkpoint",
        "separate-diffusion-model",
        "separate-unet-dual-clip-image-vae",
        "separate-unet-multi-vae",
    }
)


def _load_model_components(
    manager: ModelManager, architecture: str, components: dict
) -> tuple:
    """Load (model, clip, vae) from ModelManager based on architecture.

    Raises ValueError for unsupported architectures.
    """
    if architecture == "bundled-checkpoint":
        result = manager.load_checkpoint(components["checkpoint"])
        return result.model, result.clip, result.vae

    if architecture == "separate-diffusion-model":
        model = manager.load_unet(components["diffusion_model"])
        vae = manager.load_vae(components["vae"])
        clip = manager.load_clip(components["text_encoder"])
        return model, clip, vae

    if architecture == "separate-unet-dual-clip-image-vae":
        model = manager.load_unet(components["diffusion_model"])
        vae = manager.load_vae(components["vae"])
        clip = manager.load_clip(components["text_encoder"], components["text_encoder2"])
        return model, clip, vae

    if architecture == "separate-unet-multi-vae":
        model = manager.load_unet(components["diffusion_model"])
        vae = manager.load_vae(components["vae"])
        clip = manager.load_clip(components["text_encoder"])
        return model, clip, vae

    raise ValueError(
        f"Unsupported architecture '{architecture}'. "
        f"Supported: {', '.join(sorted(_SUPPORTED_ARCHITECTURES))}."
    )


def _decode_source_image(source_image: str) -> PILImage.Image:
    """Decode a base64-encoded image string to a PIL Image.

    Accepts pure base64 or a data URL (data:<mime>;base64,<data>).
    Raises ValueError if decoding fails or the result is not a valid image.
    """
    # Strip data URL prefix if present (e.g. "data:image/png;base64,")
    if "," in source_image and source_image.lstrip().startswith("data:"):
        source_image = source_image.split(",", 1)[1]

    source_image = source_image.strip()
    if not source_image:
        raise ValueError("source_image is empty")

    try:
        data = base64.b64decode(source_image)
    except Exception as exc:
        raise ValueError(
            "source_image contains invalid base64 data. "
            "Ensure the image is base64-encoded (with or without a data-URL prefix)."
        ) from exc

    if not data:
        raise ValueError("source_image decoded to empty bytes")

    try:
        buf = io.BytesIO(data)
        image = PILImage.open(buf)
        image.load()
        return image
    except Exception as exc:
        raise ValueError(
            "source_image is not a recognised image format. "
            "Supported formats include PNG, JPEG, and WebP."
        ) from exc


async def run_inference(request: InferRequest) -> None:
    """Run txt2img, img2img, or upscale inference and POST result or error to gateway callback."""
    callback_base = os.getenv("GATEWAY_CALLBACK_URL", "http://localhost:3000")
    callback_url = f"{callback_base}/worker/done"

    try:
        models_dir = os.environ.get("MODELS_DIR", "/mnt/models/comfyui")
        manager = ModelManager(models_dir)

        output_dir = Path(os.getenv("OUTPUT_DIR", "./outputs"))
        output_dir.mkdir(parents=True, exist_ok=True)

        if request.modality == "upscale":
            if request.source_image is None:
                raise ValueError(
                    "source_image is required for upscale modality but was not provided."
                )
            pil_image = _decode_source_image(request.source_image)
            upscale_model = manager.load_upscale_model(request.components.get("checkpoint", ""))
            image_tensor = image_to_tensor(pil_image)
            output_tensor = image_upscale_with_model(upscale_model, image_tensor)
            arr = (output_tensor[0].cpu().float().numpy().clip(0, 1) * 255).astype(np.uint8)
            image = PILImage.fromarray(arr)
            output_path = output_dir / f"{request.id}.png"
            image.save(str(output_path))
            url = f"{callback_base}/outputs/{request.id}.png"

        elif request.modality == "txt2vid":
            fps = request.video_fps
            length = max(1, int(request.duration * fps))
            model, clip, vae = _load_model_components(
                manager, request.architecture, request.components
            )
            positive = encode_prompt(clip, request.prompt)
            negative = encode_prompt(clip, request.negative_prompt)
            positive, negative, latent = wan_image_to_video(
                positive,
                negative,
                vae,
                width=request.width,
                height=request.height,
                length=length,
            )
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
            frames = vae_decode(vae, denoised)
            output_path = output_dir / f"{request.id}.mp4"
            save_video(frames, str(output_path), fps=float(fps))
            url = f"{callback_base}/outputs/{request.id}.mp4"

        else:
            model, clip, vae = _load_model_components(
                manager, request.architecture, request.components
            )

            positive = encode_prompt(clip, request.prompt)
            negative = encode_prompt(clip, request.negative_prompt)

            if request.modality == "img2img":
                if request.source_image is None:
                    raise ValueError(
                        "source_image is required for img2img modality but was not provided."
                    )
                pil_image = _decode_source_image(request.source_image)
                latent = vae_encode(vae, pil_image)
                denoise = request.denoise_strength
            elif request.modality == "txt2img":
                latent = empty_latent_image(request.width, request.height)
                denoise = 1.0
            else:
                raise ValueError(
                    f"Unsupported modality '{request.modality}'. "
                    "Supported: txt2img, img2img, upscale, txt2vid."
                )

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
                denoise=denoise,
            )
            image = vae_decode(vae, denoised)
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
