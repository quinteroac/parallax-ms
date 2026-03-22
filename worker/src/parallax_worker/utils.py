"""Shared utilities for the Parallax worker."""

import base64
import io
import subprocess
from pathlib import Path

from PIL import Image as PILImage


def reencode_h264(src: Path, dst: Path) -> None:
    """Re-encode *src* to H.264 MP4 at *dst* using ffmpeg, then delete *src*."""
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", str(src),
            "-c:v", "libx264", "-preset", "fast", "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-movflags", "+faststart",
            "-an",
            str(dst),
        ],
        check=True,
        capture_output=True,
    )
    src.unlink(missing_ok=True)


def _decode_source_image(source_image: str) -> PILImage.Image:
    """Decode a base64-encoded image string to a PIL Image.

    Accepts pure base64 or a data URL (data:<mime>;base64,<data>).
    Raises ValueError if decoding fails or the result is not a valid image.
    """
    # Strip data URL prefix if present (e.g. "data:image/png;base64,")
    if "," in source_image and source_image.lstrip().startswith("data:"):
        source_image = source_image.split(",", 1)[1]

    source_image = source_image.strip()
    if not source_image:
        raise ValueError("source_image is empty")

    try:
        data = base64.b64decode(source_image)
    except Exception as exc:
        raise ValueError(
            "source_image contains invalid base64 data. "
            "Ensure the image is base64-encoded (with or without a data-URL prefix)."
        ) from exc

    if not data:
        raise ValueError("source_image decoded to empty bytes")

    try:
        buf = io.BytesIO(data)
        image = PILImage.open(buf)
        image.load()
        return image
    except Exception as exc:
        raise ValueError(
            "source_image is not a recognised image format. "
            "Supported formats include PNG, JPEG, and WebP."
        ) from exc
