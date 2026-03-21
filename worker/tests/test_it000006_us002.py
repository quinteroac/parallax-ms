"""US-002 (it_000006) acceptance: worker runs txt2img for all 4 architectures."""

import subprocess
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from parallax_worker.models import InferRequest
from parallax_worker.tasks import _load_model_components, run_inference

WORKER_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# AC01 — startup.py no longer loads a checkpoint at bootstrap
# ---------------------------------------------------------------------------


def test_ac01_startup_has_no_checkpoint_loading():
    """bootstrap() does not call ModelManager or load_checkpoint."""
    import sys
    from unittest.mock import MagicMock

    import parallax_worker.startup as startup_module

    mock_check_runtime = MagicMock(
        return_value={"python_version": "3.12", "comfyui_version": "1.0"}
    )
    mock_model_manager_cls = MagicMock()

    prev_ready = startup_module._ready
    startup_module._ready = False

    try:
        with patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(check_runtime=mock_check_runtime),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_model_manager_cls),
            },
        ):
            startup_module.bootstrap()

        # ModelManager must NOT have been instantiated during bootstrap
        mock_model_manager_cls.assert_not_called()
    finally:
        startup_module._ready = prev_ready


def test_ac01_get_checkpoint_removed_from_startup():
    """startup module no longer exports get_checkpoint."""
    import parallax_worker.startup as startup_module

    assert not hasattr(startup_module, "get_checkpoint"), (
        "get_checkpoint should not exist in startup.py after AC01"
    )


# ---------------------------------------------------------------------------
# AC02 — tasks.py routes modality=txt2img to the correct loading per architecture
# ---------------------------------------------------------------------------


def test_ac02_bundled_checkpoint_calls_load_checkpoint():
    """bundled-checkpoint architecture uses manager.load_checkpoint."""
    manager = MagicMock()
    result = MagicMock()
    manager.load_checkpoint.return_value = result

    components = {"checkpoint": "model.safetensors"}
    _load_model_components(manager, "bundled-checkpoint", components)

    manager.load_checkpoint.assert_called_once_with("model.safetensors")


def test_ac02_bundled_checkpoint_returns_model_clip_vae():
    """bundled-checkpoint returns (result.model, result.clip, result.vae)."""
    manager = MagicMock()
    result = MagicMock()
    manager.load_checkpoint.return_value = result

    model, clip, vae = _load_model_components(
        manager, "bundled-checkpoint", {"checkpoint": "ckpt.safetensors"}
    )

    assert model is result.model
    assert clip is result.clip
    assert vae is result.vae


def test_ac02_separate_diffusion_model_calls_load_unet_vae_clip():
    """separate-diffusion-model architecture uses load_unet, load_vae, load_clip."""
    manager = MagicMock()
    components = {
        "diffusion_model": "unet.safetensors",
        "vae": "vae.safetensors",
        "text_encoder": "clip.safetensors",
    }

    _load_model_components(manager, "separate-diffusion-model", components)

    manager.load_unet.assert_called_once_with("unet.safetensors")
    manager.load_vae.assert_called_once_with("vae.safetensors")
    manager.load_clip.assert_called_once_with("clip.safetensors")


def test_ac02_separate_unet_dual_clip_image_vae_calls_load_clip_with_two_encoders():
    """separate-unet-dual-clip-image-vae passes both text encoders to load_clip."""
    manager = MagicMock()
    components = {
        "diffusion_model": "unet.safetensors",
        "vae": "vae.safetensors",
        "text_encoder": "clip1.safetensors",
        "text_encoder2": "clip2.safetensors",
    }

    _load_model_components(manager, "separate-unet-dual-clip-image-vae", components)

    manager.load_unet.assert_called_once_with("unet.safetensors")
    manager.load_vae.assert_called_once_with("vae.safetensors")
    manager.load_clip.assert_called_once_with("clip1.safetensors", "clip2.safetensors")


def test_ac02_separate_unet_multi_vae_calls_load_unet_vae_clip():
    """separate-unet-multi-vae architecture uses load_unet, load_vae, load_clip."""
    manager = MagicMock()
    components = {
        "diffusion_model": "unet.safetensors",
        "vae": "vae.safetensors",
        "text_encoder": "clip.safetensors",
    }

    _load_model_components(manager, "separate-unet-multi-vae", components)

    manager.load_unet.assert_called_once_with("unet.safetensors")
    manager.load_vae.assert_called_once_with("vae.safetensors")
    manager.load_clip.assert_called_once_with("clip.safetensors")


# ---------------------------------------------------------------------------
# AC03 — unsupported architecture triggers error callback with descriptive message
# ---------------------------------------------------------------------------


def test_ac03_unsupported_architecture_raises_value_error():
    """_load_model_components raises ValueError for unknown architectures."""
    manager = MagicMock()
    with pytest.raises(ValueError, match="Unsupported architecture 'unknown-arch'"):
        _load_model_components(manager, "unknown-arch", {})


@pytest.mark.anyio
async def test_ac03_unsupported_architecture_posts_error_callback():
    """run_inference posts error callback when architecture is not supported."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(
                id="job-bad-arch",
                prompt="test",
                architecture="unsupported-arch",
                components={},
            )
        )

    mock_post.assert_awaited_once()
    call_args = mock_post.call_args
    payload = call_args.kwargs["json"]
    assert payload["id"] == "job-bad-arch"
    assert "error" in payload
    assert "unsupported-arch" in payload["error"]
    assert "url" not in payload


@pytest.mark.anyio
async def test_ac03_error_callback_goes_to_worker_done():
    """Error callback from unsupported architecture is POSTed to /worker/done."""
    mock_post = AsyncMock()

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch.dict("os.environ", {"GATEWAY_CALLBACK_URL": "http://gw:3000"}),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(
            InferRequest(id="job-x", prompt="test", architecture="bad", components={})
        )

    call_args = mock_post.call_args
    assert call_args.args[0] == "http://gw:3000/worker/done"


# ---------------------------------------------------------------------------
# AC04 — output PNG written to OUTPUT_DIR; callback URL uses GATEWAY_CALLBACK_URL
# ---------------------------------------------------------------------------


@pytest.mark.anyio
async def test_ac04_png_written_to_output_dir():
    """Successful inference writes {id}.png to OUTPUT_DIR."""
    mock_image = MagicMock()

    with tempfile.TemporaryDirectory() as tmp:
        with (
            patch("parallax_worker.tasks.ModelManager"),
            patch(
                "parallax_worker.tasks._load_model_components",
                return_value=(MagicMock(), MagicMock(), MagicMock()),
            ),
            patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
            patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
            patch("parallax_worker.tasks.sample", return_value=MagicMock()),
            patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
            patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
            patch.dict("os.environ", {"OUTPUT_DIR": tmp}),
        ):
            mock_client = AsyncMock()
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=False)
            mock_client.post = AsyncMock(return_value=MagicMock())
            mock_client_cls.return_value = mock_client

            await run_inference(InferRequest(id="job-png", prompt="sky"))

        expected = Path(tmp) / "job-png.png"
        mock_image.save.assert_called_once_with(str(expected))


@pytest.mark.anyio
async def test_ac04_callback_url_is_gateway_callback_url_outputs():
    """Callback URL is {GATEWAY_CALLBACK_URL}/outputs/{id}.png."""
    mock_image = MagicMock()
    mock_post = AsyncMock(return_value=MagicMock())

    with (
        patch("parallax_worker.tasks.ModelManager"),
        patch(
            "parallax_worker.tasks._load_model_components",
            return_value=(MagicMock(), MagicMock(), MagicMock()),
        ),
        patch("parallax_worker.tasks.encode_prompt", return_value=MagicMock()),
        patch("parallax_worker.tasks.empty_latent_image", return_value=MagicMock()),
        patch("parallax_worker.tasks.sample", return_value=MagicMock()),
        patch("parallax_worker.tasks.vae_decode", return_value=mock_image),
        patch("parallax_worker.tasks.httpx.AsyncClient") as mock_client_cls,
        patch("parallax_worker.tasks.Path.mkdir"),
        patch.dict("os.environ", {"GATEWAY_CALLBACK_URL": "http://gw:3000"}),
    ):
        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = mock_post
        mock_client_cls.return_value = mock_client

        await run_inference(InferRequest(id="job-url", prompt="forest"))

    call_args = mock_post.call_args
    assert call_args.kwargs["json"]["url"] == "http://gw:3000/outputs/job-url.png"


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
