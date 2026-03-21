"""Runtime bootstrap for the Parallax worker."""

import logging
import sys
from typing import Any

logger = logging.getLogger(__name__)

_ready: bool = False


def bootstrap() -> None:
    """Bootstrap the ComfyUI runtime.

    Calls check_runtime() and exits with a non-zero code on any failure.
    Model loading is performed per-request in tasks.py using architecture
    and components from the request body.
    """
    global _ready

    from comfy_diffusion import check_runtime

    # Verify the runtime is healthy; exit immediately on any error
    runtime: dict[str, Any] = check_runtime()
    if "error" in runtime:
        logger.error("Runtime bootstrap failed: %s", runtime["error"])
        sys.exit(1)

    _ready = True


def is_ready() -> bool:
    """Return True if the runtime is fully loaded."""
    return _ready
