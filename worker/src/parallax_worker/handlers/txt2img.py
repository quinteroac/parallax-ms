"""txt2img modality handler."""

import logging
from pathlib import Path

from comfy_diffusion import vae_decode

logger = logging.getLogger(__name__)
from comfy_diffusion.conditioning import encode_prompt
from comfy_diffusion.latent import empty_latent_image
from comfy_diffusion.models import ModelManager
from comfy_diffusion.sampling import sample

from parallax_worker.handlers.base import ModalityHandler
from parallax_worker.model_loader import load_model_components
from parallax_worker.models import InferRequest


class Txt2ImgHandler(ModalityHandler):
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        logger.info("txt2img start  job=%s size=%dx%d steps=%d seed=%d",
                    request.id, request.width, request.height, request.steps, request.seed)
        mc = load_model_components(manager, request.architecture, request.components)
        positive = encode_prompt(mc.clip, request.prompt)
        negative = encode_prompt(mc.clip, request.negative_prompt)
        latent = empty_latent_image(request.width, request.height)
        logger.info("txt2img sampling  job=%s", request.id)
        denoised = sample(
            mc.model,
            positive,
            negative,
            latent,
            request.steps,
            request.cfg,
            request.sampler_name,
            request.scheduler,
            request.seed,
            denoise=1.0,
        )
        image = vae_decode(mc.vae, denoised)
        output_path = output_dir / f"{request.id}.png"
        image.save(str(output_path))
        logger.info("txt2img done  job=%s output=%s", request.id, output_path)
        return f"{callback_base}/outputs/{request.id}.png"
