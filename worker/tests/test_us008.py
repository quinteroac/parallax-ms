"""US-008: Automated tests for critical paths (Worker)."""

import pytest
from fastapi.testclient import TestClient

from parallax_worker.main import app
from parallax_worker.models import InferRequest

client = TestClient(app)


# AC03 — POST /infer returns 202 Accepted
def test_ac03_post_infer_returns_202():
    response = client.post(
        "/infer",
        json={"id": "job-us008", "type": "text-to-image", "params": {"prompt": "a cat"}},
    )
    assert response.status_code == 202
    assert response.json() == {"message": "accepted"}


# AC03 — Pydantic validation rejects a bad body
def test_ac03_pydantic_rejects_missing_required_fields():
    with pytest.raises(Exception):
        InferRequest(type="text-to-image")  # type: ignore[call-arg]  # id and params missing


def test_ac03_post_infer_rejects_bad_body():
    response = client.post(
        "/infer",
        json={"not_a_valid_field": "value"},
    )
    assert response.status_code == 422
