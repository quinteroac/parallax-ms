"""US-002 acceptance: runtime bootstrap and model load at startup."""

import sys
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import parallax_worker.startup as startup_module

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_runtime(*, error: str | None = None) -> dict:
    """Return a simulated check_runtime() result."""
    result: dict = {
        "python_version": "3.12.0",
        "comfyui_version": "1.0.0",
        "device": "cpu",
        "vram_total_mb": None,
        "vram_free_mb": None,
    }
    if error:
        result["error"] = error
    return result


@pytest.fixture(autouse=True)
def reset_ready():
    """Reset module-level _ready flag before and after every test."""
    startup_module._ready = False
    yield
    startup_module._ready = False


# ---------------------------------------------------------------------------
# AC01 — check_runtime() is called during bootstrap
# ---------------------------------------------------------------------------


def test_ac01_check_runtime_called_on_bootstrap():
    mock_check_runtime = MagicMock(return_value=_make_runtime())
    mock_manager = MagicMock()
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(check_runtime=mock_check_runtime),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/models", "CHECKPOINT_FILENAME": "v1.safetensors"},
        ),
    ):
        startup_module.bootstrap()

    mock_check_runtime.assert_called_once()


# ---------------------------------------------------------------------------
# AC02 — error key in check_runtime result → sys.exit(1)
# ---------------------------------------------------------------------------


def test_ac02_runtime_error_exits():
    mock_check_runtime = MagicMock(return_value=_make_runtime(error="GPU not found"))

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(check_runtime=mock_check_runtime),
                "comfy_diffusion.models": MagicMock(),
            },
        ),
        pytest.raises(SystemExit) as exc_info,
    ):
        startup_module.bootstrap()

    assert exc_info.value.code != 0


def test_ac02_runtime_error_is_logged():
    mock_check_runtime = MagicMock(return_value=_make_runtime(error="GPU not found"))

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(check_runtime=mock_check_runtime),
                "comfy_diffusion.models": MagicMock(),
            },
        ),
        patch("parallax_worker.startup.logger") as mock_logger,
        pytest.raises(SystemExit),
    ):
        startup_module.bootstrap()

    mock_logger.error.assert_called_once()


# ---------------------------------------------------------------------------
# AC03 — ModelManager instantiated with MODELS_DIR; load_checkpoint called
# ---------------------------------------------------------------------------


def test_ac03_model_manager_instantiated_with_models_dir():
    mock_manager = MagicMock()
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/my/models", "CHECKPOINT_FILENAME": "ckpt.safetensors"},
        ),
    ):
        startup_module.bootstrap()

    mock_manager_cls.assert_called_once_with("/my/models")


def test_ac03_load_checkpoint_called_once_with_filename():
    mock_manager = MagicMock()
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/my/models", "CHECKPOINT_FILENAME": "ckpt.safetensors"},
        ),
    ):
        startup_module.bootstrap()

    mock_manager.load_checkpoint.assert_called_once_with("ckpt.safetensors")


# ---------------------------------------------------------------------------
# AC04 — load_checkpoint failure → logged + sys.exit(non-zero)
# ---------------------------------------------------------------------------


def test_ac04_checkpoint_not_found_exits():
    mock_manager = MagicMock()
    mock_manager.load_checkpoint.side_effect = FileNotFoundError("file not found")
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/my/models", "CHECKPOINT_FILENAME": "missing.safetensors"},
        ),
        pytest.raises(SystemExit) as exc_info,
    ):
        startup_module.bootstrap()

    assert exc_info.value.code != 0


def test_ac04_checkpoint_failure_is_logged():
    mock_manager = MagicMock()
    mock_manager.load_checkpoint.side_effect = RuntimeError("corrupt checkpoint")
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/my/models", "CHECKPOINT_FILENAME": "bad.safetensors"},
        ),
        patch("parallax_worker.startup.logger") as mock_logger,
        pytest.raises(SystemExit),
    ):
        startup_module.bootstrap()

    mock_logger.error.assert_called_once()


# ---------------------------------------------------------------------------
# AC05 — GET /health returns 200 only after successful startup
# ---------------------------------------------------------------------------


def test_ac05_health_returns_503_before_startup():
    from parallax_worker.main import app

    # _ready is False (reset by fixture); no lifespan triggered without context manager
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 503


def test_ac05_health_returns_200_after_successful_startup():
    from parallax_worker.main import app

    startup_module._ready = True
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_ac05_lifespan_triggers_bootstrap_and_health_returns_200():
    """End-to-end: lifespan runs bootstrap, then health returns 200."""
    from parallax_worker.main import app

    mock_manager = MagicMock()
    mock_manager_cls = MagicMock(return_value=mock_manager)

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
                "comfy_diffusion.models": MagicMock(ModelManager=mock_manager_cls),
            },
        ),
        patch.dict(
            "os.environ",
            {"MODELS_DIR": "/models", "CHECKPOINT_FILENAME": "v1.safetensors"},
        ),
        TestClient(app) as client,
    ):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
