"""txt2vid modality handler."""

import logging
from pathlib import Path

from comfy_diffusion import vae_decode_batch

logger = logging.getLogger(__name__)
from comfy_diffusion.conditioning import encode_prompt, wan_image_to_video
from comfy_diffusion.models import ModelManager
from comfy_diffusion.sampling import sample
from comfy_diffusion.video import save_video

from parallax_worker.handlers.base import ModalityHandler
from parallax_worker.model_loader import load_model_components
from parallax_worker.models import InferRequest
from parallax_worker.utils import reencode_h264


class Txt2VidHandler(ModalityHandler):
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        fps = request.video_fps
        length = max(1, int(request.duration * fps))
        logger.info("txt2vid start  job=%s size=%dx%d frames=%d fps=%d steps=%d seed=%d",
                    request.id, request.width, request.height, length, fps, request.steps, request.seed)
        mc = load_model_components(manager, request.architecture, request.components)
        positive = encode_prompt(mc.clip, request.prompt)
        negative = encode_prompt(mc.clip, request.negative_prompt)
        positive, negative, latent = wan_image_to_video(
            positive,
            negative,
            mc.vae,
            width=request.width,
            height=request.height,
            length=length,
        )
        logger.info("txt2vid sampling  job=%s", request.id)
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
        )
        frames = vae_decode_batch(mc.vae, denoised)
        tmp_path = output_dir / f"{request.id}_raw.mp4"
        output_path = output_dir / f"{request.id}.mp4"
        save_video(frames, str(tmp_path), fps=float(fps))
        reencode_h264(tmp_path, output_path)
        if not output_path.exists():
            raise RuntimeError(f"Expected MP4 output at {output_path} but the file is missing.")
        logger.info("txt2vid done  job=%s output=%s", request.id, output_path)
        return f"{callback_base}/outputs/{request.id}.mp4"
