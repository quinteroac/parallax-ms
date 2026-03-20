from fastapi import FastAPI

app = FastAPI(title="Parallax Worker", version="0.1.0")


@app.get("/")
async def root():
    return {"ok": True, "service": "parallax-worker"}
