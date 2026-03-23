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

_ACE_STEP_15_SAMPLE_RATE = 44100
_ACE_STEP_15_TRAILING_SILENCE_SECS = 5
_MIN_DURATION_SECS = 1


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
            generate_audio_codes=False,
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
        waveform = mc.vae.decode(denoised["samples"])

        # Trim trailing ACE silence (last 5 s), but never below 1 second total.
        total_frames = waveform.shape[-1]
        trim_frames = int(_ACE_STEP_15_TRAILING_SILENCE_SECS * _ACE_STEP_15_SAMPLE_RATE)
        min_frames = int(_MIN_DURATION_SECS * _ACE_STEP_15_SAMPLE_RATE)
        keep_frames = max(total_frames - trim_frames, min_frames)
        waveform = waveform[..., :keep_frames]

        output_path = output_dir / f"{request.id}.wav"
        wav_data = waveform.cpu().numpy()
        if wav_data.ndim == 2:
            wav_data = wav_data.T  # [channel, time] -> [time, channel]
        scipy.io.wavfile.write(str(output_path), _ACE_STEP_15_SAMPLE_RATE, wav_data)

        if not output_path.exists():
            raise RuntimeError(f"WAV file was not written to {output_path}")

        logger.info("txt2audio done  job=%s output=%s", request.id, output_path)
        return f"{callback_base}/outputs/{request.id}.wav"
