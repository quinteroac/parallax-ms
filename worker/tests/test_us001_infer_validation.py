"""US-001 (it_000003) acceptance: validated infer payload."""

import subprocess
from pathlib import Path

from fastapi.testclient import TestClient

from parallax_worker.main import app
from parallax_worker.models import InferRequest

WORKER_ROOT = Path(__file__).resolve().parents[1]

client = TestClient(app)


# AC01 — InferRequest Pydantic model has required and optional fields
def test_ac01_infer_request_required_fields():
    req = InferRequest(id="job-1", prompt="a sunset")
    assert req.id == "job-1"
    assert req.prompt == "a sunset"


def test_ac01_infer_request_optional_field_defaults():
    req = InferRequest(id="job-1", prompt="a sunset")
    assert req.negative_prompt == ""
    assert req.width == 512
    assert req.height == 512
    assert req.steps == 20
    assert req.cfg == 7.0
    assert req.seed == 0
    assert req.sampler_name == "euler"
    assert req.scheduler == "normal"


def test_ac01_infer_request_optional_fields_can_be_overridden():
    req = InferRequest(
        id="job-2",
        prompt="a cat",
        negative_prompt="blurry",
        width=768,
        height=512,
        steps=30,
        cfg=8.5,
        seed=42,
        sampler_name="dpm",
        scheduler="karras",
    )
    assert req.negative_prompt == "blurry"
    assert req.width == 768
    assert req.steps == 30
    assert req.cfg == 8.5
    assert req.seed == 42
    assert req.sampler_name == "dpm"
    assert req.scheduler == "karras"


# AC02 — Missing required fields return 422
def test_ac02_missing_id_returns_422():
    response = client.post("/infer", json={"prompt": "a cat"})
    assert response.status_code == 422


def test_ac02_missing_prompt_returns_422():
    response = client.post("/infer", json={"id": "job-1"})
    assert response.status_code == 422


def test_ac02_empty_body_returns_422():
    response = client.post("/infer", json={})
    assert response.status_code == 422


# AC03 — Valid request returns 202 Accepted
def test_ac03_valid_request_returns_202():
    response = client.post("/infer", json={"id": "job-ok", "prompt": "a mountain"})
    assert response.status_code == 202


def test_ac03_valid_request_with_all_fields_returns_202():
    response = client.post(
        "/infer",
        json={
            "id": "job-full",
            "prompt": "a forest",
            "negative_prompt": "blurry",
            "width": 768,
            "height": 512,
            "steps": 25,
            "cfg": 6.5,
            "seed": 99,
            "sampler_name": "dpm",
            "scheduler": "karras",
        },
    )
    assert response.status_code == 202


# AC04 — Ruff lint passes
def test_ac04_ruff_check_passes():
    result = subprocess.run(
        ["uv", "run", "ruff", "check", "src", "tests"],
        cwd=WORKER_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
