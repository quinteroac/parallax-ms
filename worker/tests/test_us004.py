"""US-004 acceptance: worker HTTP health aligned with gateway."""

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from parallax_worker.main import app

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER_ROOT = REPO_ROOT / "worker"


def test_ac01_readme_documents_uv_sync_and_uvicorn_start():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    lower = readme.lower()
    assert "cd worker" in lower
    assert "uv sync" in lower
    assert "uv run uvicorn" in lower
    assert "parallax_worker.main:app" in readme


def test_ac02_get_health_returns_200_with_json_body():
    client = TestClient(app)
    res = client.get("/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_ac03_semantics_match_gateway_and_readme_documents_alignment():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert "/health" in readme
    assert "worker health" in readme.lower() or "Worker health" in readme
    assert "200" in readme
    assert "status" in readme and "ok" in readme

    gateway_index = (REPO_ROOT / "gateway" / "src" / "index.ts").read_text(encoding="utf-8")
    assert "status" in gateway_index and '"ok"' in gateway_index

    client = TestClient(app)
    assert client.get("/health").json() == {"status": "ok"}


def test_ac04_ruff_check_passes_for_src_and_tests():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
