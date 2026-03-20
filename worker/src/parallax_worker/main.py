from fastapi import BackgroundTasks, FastAPI

from parallax_worker.models import InferRequest
from parallax_worker.tasks import run_inference

app = FastAPI(title="Parallax Worker", version="0.1.0")


@app.get(
    "/health",
    response_model=dict[str, str],
    summary="Liveness / readiness probe",
)
async def health():
    """Return the same JSON liveness payload as the gateway ``GET /health`` handler."""
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"ok": True, "service": "parallax-worker"}


@app.post("/infer", status_code=202)
async def infer(request: InferRequest, background_tasks: BackgroundTasks):
    """Accept an inference request, queue a background task, and return 202 immediately."""
    background_tasks.add_task(run_inference, request.id)
    return {"message": "accepted"}
