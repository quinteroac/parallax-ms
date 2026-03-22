"""upscale modality handler."""

import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger(__name__)
from comfy_diffusion.image import image_to_tensor, image_upscale_with_model
from comfy_diffusion.models import ModelManager
from PIL import Image as PILImage

from parallax_worker.handlers.base import ModalityHandler
from parallax_worker.models import InferRequest
from parallax_worker.utils import _decode_source_image


class UpscaleHandler(ModalityHandler):
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        if request.source_image is None:
            raise ValueError(
                "source_image is required for upscale modality but was not provided."
            )
        logger.info("upscale start  job=%s", request.id)
        pil_image = _decode_source_image(request.source_image)
        logger.info("upscale source image size=%dx%d  job=%s", pil_image.width, pil_image.height, request.id)
        upscale_model = manager.load_upscale_model(request.components.get("checkpoint", ""))
        image_tensor = image_to_tensor(pil_image)
        output_tensor = image_upscale_with_model(upscale_model, image_tensor)
        arr = (output_tensor[0].cpu().float().numpy().clip(0, 1) * 255).astype(np.uint8)
        image = PILImage.fromarray(arr)
        output_path = output_dir / f"{request.id}.png"
        image.save(str(output_path))
        logger.info("upscale done  job=%s output=%s output_size=%dx%d", request.id, output_path, image.width, image.height)
        return f"{callback_base}/outputs/{request.id}.png"
