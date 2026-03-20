"""US-002 acceptance: dotenvx, env templates, and Phase 1 variable documentation."""

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]

SECRET_DENYLIST = (
    "sk-ant-",
    "sk_live_",
    "sk-proj-",
    "ghp_",
    "gho_",
    "github_pat_",
    "xoxb-",
    "xoxp-",
    "AIza",
    "AKIA",
)


def test_ac01_dotenvx_dependency_and_docs():
    pkg = (REPO_ROOT / "gateway" / "package.json").read_text(encoding="utf-8")
    assert "@dotenvx/dotenvx" in pkg
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8")
    assert "dotenvx" in readme.lower()
    assert "@dotenvx/dotenvx" in readme or "config()" in readme


def test_ac02_env_examples_have_no_secret_shaped_content():
    for rel in ("gateway/.env.example", "worker/.env.example"):
        text = (REPO_ROOT / rel).read_text(encoding="utf-8").lower()
        for bad in SECRET_DENYLIST:
            assert bad.lower() not in text


def test_ac03_readme_phase1_variable_table():
    readme = (REPO_ROOT / "README.md").read_text(encoding="utf-8").lower()
    assert "phase 1" in readme
    assert "required" in readme
    assert "optional" in readme
    assert "later phase" in readme


def test_ac04_ruff_config_present_for_worker_lint():
    pyproject = (REPO_ROOT / "worker" / "pyproject.toml").read_text(encoding="utf-8")
    assert "ruff" in pyproject.lower()
