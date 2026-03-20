"""US-005 acceptance: README stack table aligned with package manifests."""

import re
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
WORKER_ROOT = REPO_ROOT / "worker"


def test_ac01_gateway_manifest_matches_readme_phase1_node_stack():
    pkg = (REPO_ROOT / "gateway" / "package.json").read_text(encoding="utf-8")
    assert '"elysia"' in pkg or "elysia" in pkg
    assert "p-queue" in pkg
    assert "@dotenvx/dotenvx" in pkg

    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert re.search(r"gateway/package\.json", readme, re.I)
    assert "Elysia" in readme or "elysia" in readme.lower()
    assert "p-queue" in readme.lower()
    assert "dotenvx" in readme.lower()


def test_ac02_worker_manifest_matches_readme_phase1_python_stack():
    pyproject = (WORKER_ROOT / "pyproject.toml").read_text(encoding="utf-8").lower()
    assert "fastapi" in pyproject
    assert "uvicorn" in pyproject
    assert "pydantic" in pyproject

    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8").lower()
    assert "worker/pyproject.toml" in readme
    assert "fastapi" in readme
    assert "uvicorn" in readme
    assert "pydantic" in readme


def test_ac03_readme_explicitly_documents_optional_and_future_stack_items():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8").lower()
    assert "portless" in readme
    assert "comfy-diffusion" in readme
    assert "not a phase 1 package dependency" in readme
    assert "not in the phase 1 worker manifest" in readme


def test_ac04_ruff_check_passes_for_src_and_tests():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
