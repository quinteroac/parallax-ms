"""img2vid modality handler."""

import logging
from pathlib import Path

from comfy_diffusion import vae_decode_batch

logger = logging.getLogger(__name__)
from comfy_diffusion.conditioning import encode_clip_vision, encode_prompt, wan_image_to_video
from comfy_diffusion.image import image_to_tensor
from comfy_diffusion.models import ModelManager
from comfy_diffusion.sampling import sample
from comfy_diffusion.video import save_video

from parallax_worker.handlers.base import ModalityHandler
from parallax_worker.model_loader import load_model_components
from parallax_worker.models import InferRequest
from parallax_worker.utils import _decode_source_image, reencode_h264


class Img2VidHandler(ModalityHandler):
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        if request.source_image is None:
            raise ValueError(
                "source_image is required for img2vid modality but was not provided."
            )
        fps = request.video_fps
        length = max(1, int(request.duration * fps))
        logger.info("img2vid start  job=%s size=%dx%d frames=%d fps=%d steps=%d seed=%d",
                    request.id, request.width, request.height, length, fps, request.steps, request.seed)
        pil_image = _decode_source_image(request.source_image).convert("RGB")
        image_tensor = image_to_tensor(pil_image)
        mc = load_model_components(manager, request.architecture, request.components)
        positive = encode_prompt(mc.clip, request.prompt)
        negative = encode_prompt(mc.clip, request.negative_prompt)
        if mc.clip_vision is not None:
            logger.info("img2vid clip_vision_encode  job=%s", request.id)
            clip_vision_output = encode_clip_vision(mc.clip_vision, image_tensor)
        else:
            logger.warning("img2vid no clip_vision loaded — image conditioning will be skipped  job=%s", request.id)
            clip_vision_output = None
        positive, negative, latent = wan_image_to_video(
            positive,
            negative,
            mc.vae,
            width=request.width,
            height=request.height,
            length=length,
            start_image=image_tensor,
            clip_vision_output=clip_vision_output,
        )
        logger.info("img2vid sampling  job=%s", request.id)
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
        logger.info("img2vid done  job=%s output=%s", request.id, output_path)
        return f"{callback_base}/outputs/{request.id}.mp4"
