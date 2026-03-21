"""Pydantic models for the Parallax worker API."""

from typing import Literal

from pydantic import BaseModel, Field


class InferRequest(BaseModel):
    id: str
    prompt: str
    modelId: str = ""
    modality: Literal["txt2img", "img2img", "upscale", "txt2vid", "img2vid"] = "txt2img"
    architecture: str = ""
    components: dict = {}
    negative_prompt: str = ""
    width: int = 512
    height: int = 512
    steps: int = 20
    cfg: float = 7.0
    seed: int = 0
    sampler_name: str = "euler"
    scheduler: str = "normal"
    source_image: str | None = None
    denoise_strength: float = Field(default=0.75, ge=0.0, le=1.0)
    duration: float = Field(default=5.0, gt=0.0)
    video_fps: int = Field(default=16, gt=0)
