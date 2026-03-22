import logging
import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI
from fastapi.responses import JSONResponse

from parallax_worker.models import InferRequest
from parallax_worker.startup import bootstrap, is_ready
from parallax_worker.tasks import run_inference

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s  %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    output_dir = Path(os.getenv("OUTPUT_DIR", "./outputs"))
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Worker starting up — output_dir=%s", output_dir.resolve())
    bootstrap()
    logger.info("Worker ready")
    yield
    logger.info("Worker shutting down")


app = FastAPI(title="Parallax Worker", version="0.1.0", lifespan=lifespan)


@app.get(
    "/health",
    summary="Liveness / readiness probe",
)
async def health():
    """Return 200 only after the runtime and model are loaded successfully."""
    if not is_ready():
        return JSONResponse(status_code=503, content={"status": "not ready"})
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"ok": True, "service": "parallax-worker"}


@app.post("/infer", status_code=202)
async def infer(request: InferRequest, background_tasks: BackgroundTasks):
    """Accept an inference request, queue a background task, and return 202 immediately."""
    logger.info("Accepted job id=%s modality=%s model=%s", request.id, request.modality, request.modelId)
    background_tasks.add_task(run_inference, request)
    return {"message": "accepted"}
