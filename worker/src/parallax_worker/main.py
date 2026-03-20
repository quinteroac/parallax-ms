from fastapi import FastAPI

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
