"""Runtime bootstrap and model loading for the Parallax worker."""

import logging
import os
import sys
from typing import Any

logger = logging.getLogger(__name__)

_ready: bool = False


def bootstrap() -> None:
    """Bootstrap the ComfyUI runtime and load the checkpoint.

    Calls check_runtime(), instantiates ModelManager, and loads the checkpoint
    configured via MODELS_DIR and CHECKPOINT_FILENAME environment variables.
    Exits with a non-zero code on any failure.
    """
    global _ready

    from comfy_diffusion import check_runtime
    from comfy_diffusion.models import ModelManager

    # AC01 / AC02 — call check_runtime(); exit on error
    runtime: dict[str, Any] = check_runtime()
    if "error" in runtime:
        logger.error("Runtime bootstrap failed: %s", runtime["error"])
        sys.exit(1)

    # AC03 / AC04 — instantiate ModelManager and load checkpoint; exit on failure
    models_dir = os.environ.get("MODELS_DIR", "")
    checkpoint_filename = os.environ.get("CHECKPOINT_FILENAME", "")

    try:
        manager = ModelManager(models_dir)
        manager.load_checkpoint(checkpoint_filename)
    except Exception as exc:
        logger.error("Failed to load checkpoint '%s': %s", checkpoint_filename, exc)
        sys.exit(1)

    _ready = True


def is_ready() -> bool:
    """Return True if the runtime and model are fully loaded."""
    return _ready
