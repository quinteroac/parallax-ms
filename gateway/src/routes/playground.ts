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
    input[type="number"],
    select {
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
    input[type="number"]:focus,
    select:focus {
      border-color: #5b5bd6;
    }

    select option {
      background: #1a1a22;
      color: #e2e2e8;
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .mode-toggle {
      display: flex;
      gap: 0;
      background: #1a1a22;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      overflow: hidden;
    }

    .mode-toggle input[type="radio"] {
      display: none;
    }

    .mode-toggle label {
      flex: 1;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      color: #a0a0b0;
      padding: 0.55rem 1rem;
      text-align: center;
      transition: background 0.15s, color 0.15s;
      border-radius: 0;
      gap: 0;
    }

    .mode-toggle input[type="radio"]:checked + label {
      background: #5b5bd6;
      color: #fff;
    }

    input[type="file"] {
      background: #1a1a22;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      color: #e2e2e8;
      font-size: 0.9rem;
      padding: 0.5rem 0.8rem;
      width: 100%;
      cursor: pointer;
    }

    input[type="range"] {
      width: 100%;
      accent-color: #5b5bd6;
      cursor: pointer;
    }

    .range-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .range-row input[type="range"] {
      flex: 1;
    }

    .range-value {
      font-size: 0.85rem;
      color: #e2e2e8;
      min-width: 2.5rem;
      text-align: right;
    }

    .img2img-fields {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .img2img-fields.visible {
      display: flex;
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
      Model
      <select id="model-select" name="modelId" required>
        <option value="" disabled selected>Loading models\u2026</option>
      </select>
    </label>

    <div>
      <div style="font-size:0.85rem;font-weight:500;color:#a0a0b0;margin-bottom:0.35rem;">Mode</div>
      <div class="mode-toggle" id="mode-toggle">
        <input type="radio" id="mode-txt2img" name="modality" value="txt2img" checked />
        <label for="mode-txt2img">txt2img</label>
        <input type="radio" id="mode-img2img" name="modality" value="img2img" />
        <label for="mode-img2img">img2img</label>
      </div>
    </div>

    <label>
      Prompt
      <input type="text" id="prompt" name="prompt" placeholder="a serene mountain lake at sunset" required />
    </label>

    <label>
      Negative prompt <span style="font-weight:400;color:#666">(optional)</span>
      <input type="text" id="negative_prompt" name="negative_prompt" placeholder="blurry, low quality" />
    </label>

    <div class="img2img-fields" id="img2img-fields">
      <label>
        Source image
        <input type="file" id="source_image" name="source_image" accept="image/*" />
      </label>

      <label>
        Denoise strength
        <div class="range-row">
          <input type="range" id="denoise_strength" name="denoise_strength" min="0" max="1" step="0.05" value="0.75" />
          <span class="range-value" id="denoise-value">0.75</span>
        </div>
      </label>
    </div>

    <div class="row">
      <label>
        Width
        <input type="number" id="width" name="width" value="1024" min="64" max="2048" step="64" />
      </label>
      <label>
        Height
        <input type="number" id="height" name="height" value="1024" min="64" max="2048" step="64" />
      </label>
    </div>

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
    <span id="loading-text">Generating\u2026</span>
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
    const modelSelect = document.getElementById('model-select');
    const img2imgFields = document.getElementById('img2img-fields');
    const denoiseInput = document.getElementById('denoise_strength');
    const denoiseValue = document.getElementById('denoise-value');

    let activeEventSource = null;

    // Populate model selector on load
    (async () => {
      try {
        const res = await fetch('/v1/models');
        if (!res.ok) throw new Error('Failed to fetch models (' + res.status + ')');
        const data = await res.json();
        const allModels = Object.values(data).flat();
        modelSelect.innerHTML = '';
        if (allModels.length === 0) {
          const opt = document.createElement('option');
          opt.value = '';
          opt.disabled = true;
          opt.selected = true;
          opt.textContent = 'No models available';
          modelSelect.appendChild(opt);
        } else {
          allModels.forEach((m) => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            modelSelect.appendChild(opt);
          });
        }
      } catch (err) {
        modelSelect.innerHTML = '';
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.selected = true;
        opt.textContent = 'Could not load models';
        modelSelect.appendChild(opt);
      }
    })();

    // Show/hide img2img fields based on mode
    document.querySelectorAll('input[name="modality"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const isImg2img = document.getElementById('mode-img2img').checked;
        if (isImg2img) {
          img2imgFields.classList.add('visible');
        } else {
          img2imgFields.classList.remove('visible');
        }
      });
    });

    // Live denoise strength display
    denoiseInput.addEventListener('input', () => {
      denoiseValue.textContent = parseFloat(denoiseInput.value).toFixed(2);
    });

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

    function readFileAsBase64(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          // result is "data:<mime>;base64,<data>" — strip the prefix
          const result = reader.result;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = () => reject(new Error('Failed to read image file'));
        reader.readAsDataURL(file);
      });
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      closeEventSource();

      const modelId = modelSelect.value;
      const modality = document.querySelector('input[name="modality"]:checked').value;
      const prompt = document.getElementById('prompt').value.trim();
      const negativePrompt = document.getElementById('negative_prompt').value.trim();
      const width = parseInt(document.getElementById('width').value, 10);
      const height = parseInt(document.getElementById('height').value, 10);
      const steps = parseInt(document.getElementById('steps').value, 10);
      const seed = parseInt(document.getElementById('seed').value, 10);

      if (!modelId) {
        showError('Please select a model before generating.');
        return;
      }

      showLoading('Submitting job\u2026');

      let jobId;
      try {
        const params = { prompt, width, height, steps, seed };
        if (negativePrompt) params.negative_prompt = negativePrompt;

        if (modality === 'img2img') {
          const fileInput = document.getElementById('source_image');
          const file = fileInput.files && fileInput.files[0];
          if (!file) {
            hideLoading();
            showError('Please select a source image for img2img.');
            return;
          }
          const base64 = await readFileAsBase64(file);
          params.source_image = base64;
          params.denoise_strength = parseFloat(denoiseInput.value);
        }

        const res = await fetch('/v1/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ modelId, modality, params }),
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
