"""Pydantic models for the Parallax worker API."""

from pydantic import BaseModel


class InferRequest(BaseModel):
    id: str
    prompt: str
    modelId: str = ""
    modality: str = ""
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
