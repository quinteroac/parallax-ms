import { Elysia } from "elysia";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Parallax Playground</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f0f13;
      color: #e2e2e8;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }

    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      letter-spacing: -0.02em;
      margin: 0 0 2rem;
      color: #f4f4f8;
    }

    form {
      width: 100%;
      max-width: 480px;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    label {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      font-size: 0.85rem;
      font-weight: 500;
      color: #a0a0b0;
    }

    input[type="text"],
    input[type="number"] {
      background: #1a1a22;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      color: #e2e2e8;
      font-size: 0.95rem;
      padding: 0.6rem 0.8rem;
      outline: none;
      transition: border-color 0.15s;
      width: 100%;
    }

    input[type="text"]:focus,
    input[type="number"]:focus {
      border-color: #5b5bd6;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    button[type="submit"] {
      background: #5b5bd6;
      border: none;
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      font-size: 0.95rem;
      font-weight: 600;
      padding: 0.7rem 1.2rem;
      transition: background 0.15s, opacity 0.15s;
      margin-top: 0.5rem;
    }

    button[type="submit"]:hover:not(:disabled) {
      background: #6c6ce0;
    }

    button[type="submit"]:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    #loading {
      display: none;
      align-items: center;
      gap: 0.6rem;
      color: #a0a0b0;
      font-size: 0.9rem;
      margin-top: 1.5rem;
    }

    #loading.visible { display: flex; }

    .spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #2e2e3e;
      border-top-color: #5b5bd6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    #error {
      display: none;
      background: #2d1a1a;
      border: 1px solid #6b2b2b;
      border-radius: 8px;
      color: #f87171;
      font-size: 0.9rem;
      margin-top: 1.5rem;
      padding: 0.75rem 1rem;
      max-width: 480px;
      width: 100%;
    }

    #error.visible { display: block; }

    #result {
      display: none;
      border-radius: 12px;
      max-width: 512px;
      margin-top: 1.5rem;
      width: 100%;
      border: 1px solid #2e2e3e;
    }

    #result.visible { display: block; }
  </style>
</head>
<body>
  <h1>Parallax Playground</h1>

  <form id="job-form">
    <label>
      Prompt
      <input type="text" id="prompt" name="prompt" placeholder="a serene mountain lake at sunset" required />
    </label>

    <label>
      Negative prompt <span style="font-weight:400;color:#666">(optional)</span>
      <input type="text" id="negative_prompt" name="negative_prompt" placeholder="blurry, low quality" />
    </label>

    <div class="row">
      <label>
        Steps
        <input type="number" id="steps" name="steps" value="20" min="1" max="150" />
      </label>
      <label>
        Seed
        <input type="number" id="seed" name="seed" value="0" min="0" />
      </label>
    </div>

    <button type="submit" id="submit-btn">Generate</button>
  </form>

  <div id="loading" aria-live="polite">
    <div class="spinner"></div>
    <span id="loading-text">Generating…</span>
  </div>

  <div id="error" role="alert"></div>

  <img id="result" alt="Generated image" />

  <script>
    const form = document.getElementById('job-form');
    const submitBtn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const errorEl = document.getElementById('error');
    const resultImg = document.getElementById('result');

    let activeEventSource = null;

    function showLoading(text) {
      loading.classList.add('visible');
      loadingText.textContent = text || 'Generating\u2026';
      errorEl.classList.remove('visible');
      resultImg.classList.remove('visible');
      submitBtn.disabled = true;
    }

    function hideLoading() {
      loading.classList.remove('visible');
      submitBtn.disabled = false;
    }

    function showError(msg) {
      errorEl.textContent = msg;
      errorEl.classList.add('visible');
    }

    function showResult(url) {
      resultImg.src = url;
      resultImg.classList.add('visible');
    }

    function closeEventSource() {
      if (activeEventSource) {
        activeEventSource.close();
        activeEventSource = null;
      }
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      closeEventSource();

      const prompt = document.getElementById('prompt').value.trim();
      const negativePrompt = document.getElementById('negative_prompt').value.trim();
      const steps = parseInt(document.getElementById('steps').value, 10);
      const seed = parseInt(document.getElementById('seed').value, 10);

      showLoading('Submitting job\u2026');

      let jobId;
      try {
        const params = { prompt, steps, seed };
        if (negativePrompt) params.negative_prompt = negativePrompt;

        const res = await fetch('/v1/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'txt2img', params }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || 'Failed to create job (' + res.status + ')');
        }

        const data = await res.json();
        jobId = data.jobId;
      } catch (err) {
        hideLoading();
        showError(err instanceof Error ? err.message : String(err));
        return;
      }

      showLoading('Generating\u2026');

      const es = new EventSource('/v1/jobs/' + jobId + '/events');
      activeEventSource = es;

      es.onmessage = (event) => {
        closeEventSource();
        hideLoading();

        let payload;
        try {
          payload = JSON.parse(event.data);
        } catch {
          showError('Received malformed event from server.');
          return;
        }

        if (payload.status === 'succeeded' && payload.url) {
          showResult(payload.url);
        } else if (payload.status === 'failed') {
          showError(payload.error || 'Job failed without an error message.');
        } else {
          showError('Unexpected event status: ' + payload.status);
        }
      };

      es.onerror = () => {
        closeEventSource();
        hideLoading();
        showError('Lost connection to the server while waiting for the job.');
      };
    });
  </script>
</body>
</html>`;

export const playgroundRoutes = new Elysia().get(
  "/playground",
  () =>
    new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    }),
  { detail: { summary: "Playground UI for manual end-to-end testing" } },
);
