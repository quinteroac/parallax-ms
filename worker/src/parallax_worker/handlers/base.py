"""Abstract base class for modality handlers."""

from abc import ABC, abstractmethod
from pathlib import Path

from comfy_diffusion.models import ModelManager

from parallax_worker.models import InferRequest


class ModalityHandler(ABC):
    @abstractmethod
    async def run(
        self,
        request: InferRequest,
        manager: ModelManager,
        output_dir: Path,
        callback_base: str,
    ) -> str:
        """Execute inference and return the output URL."""
