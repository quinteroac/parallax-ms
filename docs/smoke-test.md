# Smoke Test — End-to-End Job Lifecycle

Verify the full job lifecycle (create → queue → worker → callback → SSE → status) before merging.

## Prerequisites

- Bun installed (`bun --version`)
- uv installed (`uv --version`)
- Dependencies installed in both packages:

```bash
cd gateway && bun install
cd ../worker && uv sync
```

---

## Step 1 — Start the gateway

Open a terminal and run:

```bash
cd gateway
bun run dev
```

Expected output:

```
[elysia] 🦊 Elysia is running at http://localhost:3000
```

Verify health:

```bash
curl -s http://localhost:3000/health
# → {"status":"ok"}
```

---

## Step 2 — Start the worker

Open a **second terminal** and run:

```bash
cd worker
uv run uvicorn parallax_worker.main:app --host 0.0.0.0 --port 8000 --reload
```

Expected output contains:

```
INFO:     Uvicorn running on http://0.0.0.0:8000
```

Verify health:

```bash
curl -s http://localhost:8000/health
# → {"status":"ok"}
```

---

## Step 3 — Open the SSE stream (before posting the job)

Open a **third terminal** and subscribe to events for a placeholder job ID so you can observe the stream live.
You will replace `JOB_ID` in the next step once you have it.

> **Tip:** skip this terminal for now and jump to step 4; come back to open the stream with the real id
> before the worker finishes (the worker waits ~2 s, so there is time).

---

## Step 4 — POST a job

```bash
curl -s -X POST http://localhost:3000/v1/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"text-to-image","params":{"prompt":"a cat","steps":20}}' \
  | tee /tmp/job.json
```

Expected response (HTTP 201):

```json
{"jobId":"<uuid>"}
```

Save the id:

```bash
JOB_ID=$(cat /tmp/job.json | grep -o '"jobId":"[^"]*"' | cut -d'"' -f4)
echo "Job id: $JOB_ID"
```

---

## Step 5 — Check status is `"pending"` (immediately after POST)

```bash
curl -s "http://localhost:3000/v1/jobs/$JOB_ID"
```

Expected (HTTP 200):

```json
{
  "id": "<uuid>",
  "status": "pending",
  ...
}
```

> The job may already show `"running"` if the queue dispatched it before you ran this command — that is correct.

---

## Step 6 — Open the SSE stream

In the third terminal (or a new one):

```bash
curl -sN "http://localhost:3000/v1/jobs/$JOB_ID/events"
```

If the job has not completed yet you will see a hanging connection. Wait ~2 seconds for the worker to finish.

Expected output once the worker posts the callback:

```
data: {"id":"<uuid>","status":"succeeded","url":"http://localhost/assets/<uuid>.png"}

```

The stream closes automatically after the terminal event is emitted.

---

## Step 7 — Check status is `"running"` (observable in gateway logs)

The gateway logs a dispatch to the worker. While the worker is sleeping you can poll:

```bash
curl -s "http://localhost:3000/v1/jobs/$JOB_ID"
```

Expected (HTTP 200) while the background task is running:

```json
{
  "id": "<uuid>",
  "status": "running",
  ...
}
```

---

## Step 8 — GET final job status (`"succeeded"`)

After the SSE event arrives, fetch the job one final time:

```bash
curl -s "http://localhost:3000/v1/jobs/$JOB_ID"
```

Expected (HTTP 200):

```json
{
  "id": "<uuid>",
  "status": "succeeded",
  "url": "http://localhost/assets/<uuid>.png",
  "createdAt": "...",
  "updatedAt": "..."
}
```

---

## Expected Lifecycle Summary

| Step | Observable signal |
|------|-------------------|
| POST `/v1/jobs` | `jobId` returned in 201 response |
| GET `/v1/jobs/:id` immediately | `status: "pending"` |
| Queue dispatches to worker | `status: "running"` (within milliseconds) |
| Worker completes (~2 s) | SSE event received: `status: "succeeded"` |
| GET `/v1/jobs/:id` after SSE | `status: "succeeded"` with `url` field present |

All five observable signals confirm the full job lifecycle is working correctly.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Gateway returns 503 or hangs on dispatch | Worker not running on port 8000 |
| SSE stream never emits | Worker failed to POST to `/worker/done`; check worker logs for callback errors |
| Status stays `"pending"` | Queue did not dispatch; check gateway logs and `WORKER_BASE_URL` env var |
| 404 on job id | Wrong id or gateway was restarted (job store is in-memory) |
