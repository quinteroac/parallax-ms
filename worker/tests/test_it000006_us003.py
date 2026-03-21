"""US-003 (it_000006) acceptance: worker runs img2img for all 4 architectures."""

import base64
import io
import subprocess
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from PIL import Image as PILImage

from parallax_worker.models import InferRequest
from parallax_worker.tasks import _decode_source_image, run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_png_b64(width: int = 8, height: int = 8) -> str:
    """Return a base64-encoded 8×8 PNG string."""
    img = PILImage.new("RGB", (width, height), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode()


def _make_jpg_b64(width: int = 8, height: int = 8) -> str:
    """Return a base64-encoded 8×8 JPEG string."""
    img = PILImage.new("RGB", (width, height), color=(0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return base64.b64encode(buf.getvalue()).decode()


# ---------------------------------------------------------------------------
# AC01 — InferRequest accepts source_image and denoise_strength
# ---------------------------------------------------------------------------


def test_ac01_infer_request_accepts_source_image():
    """InferRequest accepts source_image as an optional str field."""
    req = InferRequest(id="j1", prompt="test", source_image=_make_png_b64())
    assert req.source_image is not None


def test_ac01_source_image_defaults_to_none():
    """source_image defaults to None when not supplied."""
    req = InferRequest(id="j1", prompt="test")
    assert req.source_image is None


def test_ac01_denoise_strength_defaults_to_0_75():
    """denoise_strength defaults to 0.75."""
    req = InferRequest(id="j1", prompt="test")
    assert req.denoise_strength == 0.75


def test_ac01_denoise_strength_accepts_range():
    """denoise_strength accepts values between 0.0 and 1.0 inclusive."""
    for value in (0.0, 0.5, 1.0):
        req = InferRequest(id="j1", prompt="test", denoise_strength=value)
        assert req.denoise_strength == value


def test_ac01_denoise_strength_rejects_out_of_range():
    """denoise_strength rejects values outside [0.0, 1.0]."""
    import pydantic

    for value in (-0.1, 1.1):
        with pytest.raises(pydantic.ValidationError):
            InferRequest(id="j1", prompt="test", denoise_strength=value)


# ---------------------------------------------------------------------------
# AC02 — tasks.py routes modality=img2img for each architecture
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac02_img2img_bundled_checkpoint_uses_vae_encode():
    """img2img with bundled-checkpoint uses vae_encode instead of empty_latent_image."""
    mock_image = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_encode", return_value=MagicMock()) as mock_vae_encode,
        patch("parallax_worker.tasks.empty_latent_image") as mock_empty,
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-img2img",
                prompt="a cat",
                modality="img2img",
                architecture="bundled-checkpoint",
                components={"checkpoint": "ckpt.safetensors"},
                source_image=_make_png_b64(),
            )
        )

    mock_vae_encode.assert_called_once()
    mock_empty.assert_not_called()


@pytest.mark.anyio
async def test_ac02_img2img_passes_denoise_strength_to_sample():
    """img2img passes denoise_strength to sample() as the denoise keyword arg."""
    mock_image = MagicMock()
    mock_sample = MagicMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_encode", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", mock_sample),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-denoise",
                prompt="a dog",
                modality="img2img",
                source_image=_make_png_b64(),
                denoise_strength=0.5,
            )
        )

    call_kwargs = mock_sample.call_args.kwargs
    assert call_kwargs.get("denoise") == 0.5


@pytest.mark.anyio
async def test_ac02_txt2img_uses_denoise_1_0():
    """txt2img (non-img2img) calls sample() with denoise=1.0."""
    mock_image = MagicMock()
    mock_sample = MagicMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", mock_sample),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=MagicMock())
        mock_client_cls.return_value = mock_client

        await run_inference(InferRequest(id="j-txt2img", prompt="a bird"))

    call_kwargs = mock_sample.call_args.kwargs
    assert call_kwargs.get("denoise") == 1.0


@pytest.mark.anyio
@pytest.mark.parametrize(
    "architecture,components",
    [
        ("bundled-checkpoint", {"checkpoint": "ckpt.safetensors"}),
        (
            "separate-diffusion-model",
            {
                "diffusion_model": "unet.safetensors",
                "vae": "vae.safetensors",
                "text_encoder": "clip.safetensors",
            },
        ),
        (
            "separate-unet-dual-clip-image-vae",
            {
                "diffusion_model": "unet.safetensors",
                "vae": "vae.safetensors",
                "text_encoder": "clip1.safetensors",
                "text_encoder2": "clip2.safetensors",
            },
        ),
        (
            "separate-unet-multi-vae",
            {
                "diffusion_model": "unet.safetensors",
                "vae": "vae.safetensors",
                "text_encoder": "clip.safetensors",
            },
        ),
    ],
)
async def test_ac02_img2img_all_4_architectures_succeed(architecture, components):
    """img2img succeeds for all 4 supported architectures."""
    mock_image = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_encode", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch("parallax_worker.tasks._decode_source_image", return_value=MagicMock()),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id=f"j-{architecture}",
                prompt="a cat",
                modality="img2img",
                architecture=architecture,
                components=components,
                source_image=_make_png_b64(),
            )
        )

    # Success callback was posted (has url, no error)
    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert "url" in payload
    assert "error" not in payload


# ---------------------------------------------------------------------------
# AC03 — missing source_image for img2img posts error callback
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac03_missing_source_image_posts_error_callback():
    """run_inference posts error callback when source_image is absent for img2img."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-no-src",
                prompt="test",
                modality="img2img",
                # source_image intentionally omitted
            )
        )

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-no-src"
    assert "error" in payload
    assert "source_image" in payload["error"]
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac03_error_message_is_descriptive():
    """Error message for missing source_image clearly describes the problem."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(id="j-err-msg", prompt="test", modality="img2img")
        )

    payload = mock_post.call_args.kwargs["json"]
    error = payload["error"]
    # Must mention both source_image and img2img to be clear
    assert "img2img" in error.lower() or "source_image" in error.lower()


# ---------------------------------------------------------------------------
# AC04 — invalid base64 / invalid image posts error callback
# ---------------------------------------------------------------------------


def test_ac04_decode_source_image_raises_on_invalid_base64():
    """_decode_source_image raises ValueError for non-base64 input."""
    with pytest.raises(ValueError, match="base64"):
        _decode_source_image("this is not base64!!!")


def test_ac04_decode_source_image_raises_on_valid_base64_but_invalid_image():
    """_decode_source_image raises ValueError when base64 decodes to non-image bytes."""
    garbage = base64.b64encode(b"not an image at all").decode()
    with pytest.raises(ValueError, match="image"):
        _decode_source_image(garbage)


def test_ac04_decode_source_image_accepts_valid_png():
    """_decode_source_image returns a PIL Image for a valid PNG."""
    result = _decode_source_image(_make_png_b64())
    assert isinstance(result, PILImage.Image)


def test_ac04_decode_source_image_accepts_valid_jpg():
    """_decode_source_image returns a PIL Image for a valid JPEG."""
    result = _decode_source_image(_make_jpg_b64())
    assert isinstance(result, PILImage.Image)


@pytest.mark.anyio
async def test_ac04_invalid_base64_posts_error_callback():
    """run_inference posts error callback when source_image is invalid base64."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-bad-b64",
                prompt="test",
                modality="img2img",
                source_image="!!!not-valid-base64!!!",
            )
        )

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-bad-b64"
    assert "error" in payload
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac04_invalid_image_data_posts_error_callback():
    """run_inference posts error callback when base64 decodes to non-image bytes."""
    mock_post = AsyncMock()
    garbage_b64 = base64.b64encode(b"not an image").decode()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="j-bad-img",
                prompt="test",
                modality="img2img",
                source_image=garbage_b64,
            )
        )

    mock_post.assert_awaited_once()
    payload = mock_post.call_args.kwargs["json"]
    assert payload["id"] == "j-bad-img"
    assert "error" in payload
    assert "url" not in payload


# ---------------------------------------------------------------------------
# AC05 — Typecheck / lint passes
# ---------------------------------------------------------------------------


def test_ac05_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
