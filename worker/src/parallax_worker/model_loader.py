"""Model component loading backed by an architecture registry."""

import logging
from dataclasses import dataclass

from comfy_diffusion.models import ModelManager

logger = logging.getLogger(__name__)


@dataclass
class ModelComponents:
    model: object
    clip: object
    vae: object | None = None
    clip_vision: object | None = None


def _load_clip_vision_if_present(manager: ModelManager, components: dict) -> object | None:
    path = components.get("clip_vision")
    if path is None:
        return None
    return manager.load_clip_vision(path)


def _load_bundled_checkpoint(manager: ModelManager, components: dict) -> ModelComponents:
    result = manager.load_checkpoint(components["checkpoint"])
    clip_vision = _load_clip_vision_if_present(manager, components)
    return ModelComponents(result.model, result.clip, result.vae, clip_vision)


def _clip_type(components: dict) -> str:
    return components.get("clip_type", "stable_diffusion")


def _load_separate_diffusion_model(manager: ModelManager, components: dict) -> ModelComponents:
    model = manager.load_unet(components["diffusion_model"])
    vae = manager.load_vae(components["vae"])
    clip = manager.load_clip(components["text_encoder"], clip_type=_clip_type(components))
    clip_vision = _load_clip_vision_if_present(manager, components)
    return ModelComponents(model, clip, vae, clip_vision)


def _load_separate_unet_dual_clip_image_vae(
    manager: ModelManager, components: dict
) -> ModelComponents:
    model = manager.load_unet(components["diffusion_model"])
    vae = manager.load_vae(components["vae"])
    clip = manager.load_clip(components["text_encoder"], components["text_encoder2"], clip_type=_clip_type(components))
    clip_vision = _load_clip_vision_if_present(manager, components)
    return ModelComponents(model, clip, vae, clip_vision)


def _load_separate_unet_multi_vae(manager: ModelManager, components: dict) -> ModelComponents:
    model = manager.load_unet(components["diffusion_model"])
    vae = manager.load_vae(components["vae"])
    clip = manager.load_clip(components["text_encoder"], clip_type=_clip_type(components))
    clip_vision = _load_clip_vision_if_present(manager, components)
    return ModelComponents(model, clip, vae, clip_vision)


def _load_ace_step_15(manager: ModelManager, components: dict) -> ModelComponents:
    model = manager.load_unet(components["diffusion_model"])
    clip = manager.load_clip(components["text_encoder"], clip_type=_clip_type(components))
    return ModelComponents(model, clip)


_LOADERS: dict = {
    "bundled-checkpoint": _load_bundled_checkpoint,
    "separate-diffusion-model": _load_separate_diffusion_model,
    "separate-unet-dual-clip-image-vae": _load_separate_unet_dual_clip_image_vae,
    "separate-unet-multi-vae": _load_separate_unet_multi_vae,
    "ace-step-15": _load_ace_step_15,
}


def load_model_components(
    manager: ModelManager, architecture: str, components: dict
) -> ModelComponents:
    """Load (model, clip, vae) from ModelManager based on architecture.

    Raises ValueError for unsupported architectures.
    """
    loader = _LOADERS.get(architecture)
    if loader is None:
        raise ValueError(
            f"Unsupported architecture '{architecture}'. "
            f"Supported: {', '.join(sorted(_LOADERS))}."
        )
    logger.info("Loading model components  architecture=%s keys=%s", architecture, list(components.keys()))
    result = loader(manager, components)
    logger.info("Model components loaded   architecture=%s", architecture)
    return result
