"""txt2audio modality handler."""

import logging
from pathlib import Path

import scipy.io.wavfile
from comfy_diffusion.audio import empty_ace_step_15_latent_audio, encode_ace_step_15_audio
from comfy_diffusion.models import ModelManager
from comfy_diffusion.sampling import sample

from parallax_worker.handlers.base import ModalityHandler
from parallax_worker.model_loader import load_model_components
from parallax_worker.models import InferRequest

logger = logging.getLogger(__name__)

_ACE_STEP_15_SAMPLE_RATE = 48000


class Txt2AudioHandler(ModalityHandler):
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        logger.info(
            "txt2audio start  job=%s duration=%.1fs bpm=%d steps=%d seed=%d",
            request.id,
            request.duration,
            request.bpm,
            request.steps,
            request.seed,
        )
        mc = load_model_components(manager, request.architecture, request.components)
        positive = encode_ace_step_15_audio(
            mc.clip,
            tags=request.prompt,
            lyrics=request.lyrics,
            bpm=request.bpm,
            duration=request.duration,
            seed=request.seed,
        )
        negative = encode_ace_step_15_audio(
            mc.clip,
            tags="",
            lyrics="",
            bpm=request.bpm,
            duration=request.duration,
            seed=request.seed,
        )
        latent = empty_ace_step_15_latent_audio(seconds=request.duration)
        logger.info("txt2audio sampling  job=%s", request.id)
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
        output_path = output_dir / f"{request.id}.wav"
        samples = denoised["samples"]
        if hasattr(samples, "cpu"):
            samples = samples.cpu()
        audio_np = samples.numpy() if hasattr(samples, "numpy") else samples
        # Shape: [batch, channels, frames] → take first batch, transpose to [frames, channels]
        if audio_np.ndim == 3:
            audio_np = audio_np[0]
        if audio_np.ndim == 2:
            audio_np = audio_np.T
        scipy.io.wavfile.write(str(output_path), _ACE_STEP_15_SAMPLE_RATE, audio_np)
        logger.info("txt2audio done  job=%s output=%s", request.id, output_path)
        return f"{callback_base}/outputs/{request.id}.wav"
