"""US-002 acceptance: runtime bootstrap at startup."""

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

    with patch.dict(
        sys.modules,
        {"comfy_diffusion": MagicMock(check_runtime=mock_check_runtime)},
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
            {"comfy_diffusion": MagicMock(check_runtime=mock_check_runtime)},
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
            {"comfy_diffusion": MagicMock(check_runtime=mock_check_runtime)},
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

    with (
        patch.dict(
            sys.modules,
            {
                "comfy_diffusion": MagicMock(
                    check_runtime=MagicMock(return_value=_make_runtime())
                ),
            },
        ),
        TestClient(app) as client,
    ):
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
