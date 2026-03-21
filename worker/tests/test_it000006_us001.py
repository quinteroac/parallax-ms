"""US-001 (it_000006) acceptance: InferRequest extended with model dispatch fields."""

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from parallax_worker.main import app
from parallax_worker.models import InferRequest

client = TestClient(app)


# AC02 — InferRequest declares and validates the new fields

def test_ac02_new_fields_default_to_empty():
    req = InferRequest(id="job-1", prompt="a sunset")
    assert req.modelId == ""
    assert req.modality == ""
    assert req.architecture == ""
    assert req.components == {}


def test_ac02_new_fields_can_be_set():
    req = InferRequest(
        id="job-1",
        prompt="a sunset",
        modelId="wai-illustrious-sdxl-v160",
        modality="text-to-image",
        architecture="bundled-checkpoint",
        components={"checkpoint": "waiIllustriousSDXL_v160.safetensors"},
    )
    assert req.modelId == "wai-illustrious-sdxl-v160"
    assert req.modality == "text-to-image"
    assert req.architecture == "bundled-checkpoint"
    assert req.components == {"checkpoint": "waiIllustriousSDXL_v160.safetensors"}


def test_ac02_valid_request_with_model_fields_returns_202():
    with patch("parallax_worker.main.run_inference", new=AsyncMock()):
        response = client.post(
            "/infer",
            json={
                "id": "job-ok",
                "prompt": "a mountain",
                "modelId": "wai-illustrious-sdxl-v160",
                "modality": "text-to-image",
                "architecture": "bundled-checkpoint",
                "components": {"checkpoint": "waiIllustriousSDXL_v160.safetensors"},
            },
        )
    assert response.status_code == 202


def test_ac02_components_accepts_multi_file_dict():
    req = InferRequest(
        id="job-2",
        prompt="a forest",
        modelId="z-image-bf16",
        modality="text-to-image",
        architecture="separate-diffusion-model",
        components={
            "diffusion_model": "z_image_bf16.safetensors",
            "vae": "Z-Image_vivid_vae.safetensors",
            "text_encoder": "qwen_3_8b_fp8mixed.safetensors",
        },
    )
    assert req.components["diffusion_model"] == "z_image_bf16.safetensors"
    assert req.components["vae"] == "Z-Image_vivid_vae.safetensors"
