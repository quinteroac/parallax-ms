"""US-001 acceptance: monorepo layout and documented install/run."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def test_ac01_monorepo_separates_gateway_and_worker():
    assert (REPO_ROOT / "gateway" / "package.json").is_file()
    pyproject = (REPO_ROOT / "worker" / "pyproject.toml").read_text(encoding="utf-8")
    assert "parallax-worker" in pyproject
    assert "fastapi" in pyproject.lower()


def test_ac02_readme_documents_bun_and_uv_install():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8").lower()
    assert "bun install" in readme
    assert "uv sync" in readme


def test_ac03_readme_documents_run_commands_and_env_templates():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert "bun run dev" in readme.lower() or "bun run" in readme.lower()
    assert "uvicorn" in readme.lower()
    assert ".env.example" in readme


def test_ac04_worker_tooling_lists_ruff_for_lint():
    pyproject = (REPO_ROOT / "worker" / "pyproject.toml").read_text(encoding="utf-8")
    assert "ruff" in pyproject.lower()
