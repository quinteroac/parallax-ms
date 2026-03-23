import { Elysia } from "elysia";

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Parallax Playground</title>
  <link rel="icon" href="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%235b5bd6'/><text x='50' y='68' font-size='64' text-anchor='middle' fill='white'>P</text></svg>" />
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

    .row-3 {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: 1rem;
    }

    .mode-toggle {
      display: flex;
      gap: 0;
      background: #1a1a22;
      border: 1px solid #2e2e3e;
      border-radius: 8px;
      overflow: hidden;
      flex-wrap: wrap;
    }

    .mode-toggle input[type="radio"] {
      display: none;
    }

    .mode-toggle label {
      flex: 1;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      color: #a0a0b0;
      padding: 0.55rem 0.75rem;
      text-align: center;
      transition: background 0.15s, color 0.15s;
      border-radius: 0;
      gap: 0;
      white-space: nowrap;
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

    #generation-fields {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    #generation-fields.hidden {
      display: none;
    }

    .img2img-fields {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .img2img-fields.visible {
      display: flex;
    }

    .upscale-fields {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .upscale-fields.visible {
      display: flex;
    }

    .vid-fields {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .vid-fields.visible {
      display: flex;
    }

    .img2vid-source {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .img2vid-source.visible {
      display: flex;
    }

    .audio-fields {
      display: none;
      flex-direction: column;
      gap: 1rem;
    }

    .audio-fields.visible {
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

    #result-video {
      display: none;
      border-radius: 12px;
      max-width: 512px;
      margin-top: 1.5rem;
      width: 100%;
      border: 1px solid #2e2e3e;
      background: #000;
    }

    #result-video.visible { display: block; }

    #result-audio {
      display: none;
      margin-top: 1.5rem;
      width: 100%;
      max-width: 480px;
    }

    #result-audio.visible {
      display: block;
    }
  </style>
</head>
<body>
  <h1>Parallax Playground</h1>

  <form id="job-form" novalidate>
    <label>
      Model
      <select id="model-select" name="modelId" required>
        <option value="" disabled selected>Loading models\u2026</option>
      </select>
      <small id="model-hint" style="display:none;color:#888;"></small>
    </label>

    <fieldset style="border:none;padding:0;margin:0;">
      <legend style="font-size:0.85rem;font-weight:500;color:#a0a0b0;margin-bottom:0.35rem;padding:0;">Mode</legend>
      <div class="mode-toggle" id="mode-toggle" role="radiogroup" aria-label="Inference mode">
        <input type="radio" id="mode-txt2img" name="modality" value="txt2img" checked />
        <label for="mode-txt2img">txt2img</label>
        <input type="radio" id="mode-img2img" name="modality" value="img2img" />
        <label for="mode-img2img">img2img</label>
        <input type="radio" id="mode-upscale" name="modality" value="upscale" />
        <label for="mode-upscale">upscale</label>
        <input type="radio" id="mode-txt2vid" name="modality" value="txt2vid" />
        <label for="mode-txt2vid">txt2vid</label>
        <input type="radio" id="mode-img2vid" name="modality" value="img2vid" />
        <label for="mode-img2vid">img2vid</label>
        <input type="radio" id="mode-txt2audio" name="modality" value="txt2audio" />
        <label for="mode-txt2audio">txt2audio</label>
      </div>
    </fieldset>

    <div id="generation-fields">
      <div id="prompt-fields">
        <label>
          Prompt
          <input type="text" id="prompt" name="prompt" placeholder="a serene mountain lake at sunset" required />
        </label>

        <label style="margin-top:1rem;">
          Negative prompt <span style="font-weight:400;color:#666">(optional)</span>
          <input type="text" id="negative_prompt" name="negative_prompt" placeholder="blurry, low quality" />
        </label>
      </div>

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

      <div class="row" id="img-dimensions-row">
        <label>
          Width
          <input type="number" id="width" name="width" value="1024" min="64" max="2048" step="64" />
        </label>
        <label>
          Height
          <input type="number" id="height" name="height" value="1024" min="64" max="2048" step="64" />
        </label>
      </div>

      <div class="row-3">
        <label>
          Steps
          <input type="number" id="steps" name="steps" value="20" min="1" max="150" />
        </label>
        <label>
          CFG
          <input type="number" id="cfg" name="cfg" value="7" min="1" max="30" step="0.5" />
        </label>
        <label>
          Seed
          <input type="number" id="seed" name="seed" value="0" min="0" />
        </label>
      </div>
    </div>

    <div class="upscale-fields" id="upscale-fields">
      <label>
        Source image
        <input type="file" id="upscale_source_image" name="upscale_source_image" accept="image/*" />
      </label>
    </div>

    <div class="vid-fields" id="vid-fields">
      <div class="img2vid-source" id="img2vid-source">
        <label>
          Source image
          <input type="file" id="img2vid_source_image" name="img2vid_source_image" accept="image/*" />
        </label>
        <label>
          Or image URL <span style="font-weight:400;color:#666">(used if no file is selected)</span>
          <input type="text" id="img2vid_source_url" name="img2vid_source_url" placeholder="https://example.com/image.png" />
        </label>
      </div>

      <div class="row">
        <label>
          Width
          <input type="number" id="vid_width" name="vid_width" value="1280" min="64" max="2048" step="64" />
        </label>
        <label>
          Height
          <input type="number" id="vid_height" name="vid_height" value="768" min="64" max="2048" step="64" />
        </label>
      </div>

      <label>
        Duration (seconds)
        <input type="number" id="duration" name="duration" value="5" min="1" max="60" step="0.5" />
      </label>
    </div>

    <div class="audio-fields" id="audio-fields">
      <label>
        Lyrics <span style="font-weight:400;color:#666">(optional)</span>
        <input type="text" id="lyrics" name="lyrics" placeholder="Verse 1: ..." />
      </label>

      <div class="row">
        <label>
          Duration (seconds)
          <input type="number" id="audio_duration" name="audio_duration" value="5" min="1" max="600" step="0.5" />
        </label>
        <label>
          BPM
          <input type="number" id="bpm" name="bpm" value="120" min="1" max="300" />
        </label>
      </div>
    </div>

    <button type="submit" id="submit-btn">Generate</button>
  </form>

  <div id="loading" aria-live="polite">
    <div class="spinner"></div>
    <span id="loading-text">Generating\u2026</span>
  </div>

  <div id="error" role="alert"></div>

  <img id="result" alt="Generated image" />
  <video id="result-video" controls preload="auto"></video>
  <audio id="result-audio" controls></audio>

  <script>
    const form = document.getElementById('job-form');
    const submitBtn = document.getElementById('submit-btn');
    const loading = document.getElementById('loading');
    const loadingText = document.getElementById('loading-text');
    const errorEl = document.getElementById('error');
    const resultImg = document.getElementById('result');
    const resultVideo = document.getElementById('result-video');
    const resultAudio = document.getElementById('result-audio');
    const modelSelect = document.getElementById('model-select');
    const img2imgFields = document.getElementById('img2img-fields');
    const upscaleFields = document.getElementById('upscale-fields');
    const vidFields = document.getElementById('vid-fields');
    const img2vidSource = document.getElementById('img2vid-source');
    const audioFields = document.getElementById('audio-fields');
    const generationFields = document.getElementById('generation-fields');
    const imgDimensionsRow = document.getElementById('img-dimensions-row');
    const promptFields = document.getElementById('prompt-fields');
    const promptInput = document.getElementById('prompt');
    const denoiseInput = document.getElementById('denoise_strength');
    const denoiseValue = document.getElementById('denoise-value');

    let activeEventSource = null;
    let allModels = [];

    const modelHint = document.getElementById('model-hint');

    function populateModelSelect(modality) {
      let filtered;
      if (modality === 'upscale') {
        filtered = allModels.filter((m) => m.modalities && m.modalities.includes('upscale'));
      } else if (modality === 'txt2vid' || modality === 'img2vid') {
        filtered = allModels.filter((m) => m.modalities && m.modalities.includes(modality));
      } else if (modality === 'txt2audio') {
        filtered = allModels.filter((m) => m.modalities && m.modalities.includes('txt2audio'));
      } else {
        filtered = allModels;
      }
      modelSelect.innerHTML = '';
      if (filtered.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.disabled = true;
        opt.selected = true;
        if (allModels.length === 0) {
          opt.textContent = 'No models available';
          modelHint.style.display = 'none';
        } else if (modality === 'upscale') {
          opt.textContent = 'No upscale models available';
          modelHint.style.display = '';
          modelHint.textContent = 'No upscale models are configured. Add a model with modality: upscale to models.config.json.';
        } else {
          opt.textContent = 'No ' + modality + ' models available';
          modelHint.style.display = '';
          modelHint.textContent = 'No ' + modality + ' models are configured. Add a model with modality: ' + modality + ' to models.config.json.';
        }
        modelSelect.appendChild(opt);
      } else {
        modelHint.style.display = 'none';
        filtered.forEach((m) => {
          const opt = document.createElement('option');
          opt.value = m.id;
          opt.textContent = m.name;
          modelSelect.appendChild(opt);
        });
      }
    }

    // Populate model selector on load
    (async () => {
      try {
        const res = await fetch('/v1/models');
        if (!res.ok) throw new Error('Failed to fetch models (' + res.status + ')');
        const data = await res.json();
        allModels = Object.values(data).flat();
        const currentModality = document.querySelector('input[name="modality"]:checked').value;
        populateModelSelect(currentModality);
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

    function setGenerationControlsDisabled(disabled) {
      const controls = generationFields.querySelectorAll('input, select, textarea');
      controls.forEach((el) => {
        if (el.id === 'submit-btn') return;
        if (disabled) el.setAttribute('disabled', '');
        else el.removeAttribute('disabled');
      });
    }

    // Show/hide fields based on mode
    document.querySelectorAll('input[name="modality"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const modality = document.querySelector('input[name="modality"]:checked').value;
        const isImg2img = modality === 'img2img';
        const isUpscale = modality === 'upscale';
        const isVideo = modality === 'txt2vid' || modality === 'img2vid';
        const isImg2vid = modality === 'img2vid';
        const isAudio = modality === 'txt2audio';

        if (isUpscale) {
          generationFields.classList.add('hidden');
          upscaleFields.classList.add('visible');
          vidFields.classList.remove('visible');
          audioFields.classList.remove('visible');
          submitBtn.textContent = 'Upscale';
        } else if (isAudio) {
          generationFields.classList.remove('hidden');
          promptFields.style.display = '';
          promptInput.disabled = false;
          imgDimensionsRow.style.display = 'none';
          upscaleFields.classList.remove('visible');
          vidFields.classList.remove('visible');
          audioFields.classList.add('visible');
          submitBtn.textContent = 'Generate audio';
        } else if (isVideo) {
          // Both txt2vid and img2vid show generation fields (prompt, steps/cfg/seed).
          generationFields.classList.remove('hidden');
          promptFields.style.display = '';
          promptInput.disabled = false;
          // Hide the img dimensions row — vid-fields already has its own width/height
          imgDimensionsRow.style.display = 'none';
          upscaleFields.classList.remove('visible');
          vidFields.classList.add('visible');
          audioFields.classList.remove('visible');
          submitBtn.textContent = 'Generate video';
        } else {
          generationFields.classList.remove('hidden');
          promptFields.style.display = '';
          promptInput.disabled = false;
          imgDimensionsRow.style.display = '';
          upscaleFields.classList.remove('visible');
          vidFields.classList.remove('visible');
          audioFields.classList.remove('visible');
          submitBtn.textContent = 'Generate';
        }

        if (isImg2img) {
          img2imgFields.classList.add('visible');
        } else {
          img2imgFields.classList.remove('visible');
        }

        if (isImg2vid) {
          img2vidSource.classList.add('visible');
        } else {
          img2vidSource.classList.remove('visible');
        }

        populateModelSelect(modality);

        // disable generation controls only in upscale mode; in img2vid the prompt
        // input is individually disabled above, steps/cfg/seed remain enabled.
        setGenerationControlsDisabled(isUpscale);
      });
    });

    // Ensure initial disabled state matches the current modality.
    const initialModality = document.querySelector('input[name="modality"]:checked').value;
    setGenerationControlsDisabled(initialModality === 'upscale');

    // Live denoise strength display
    denoiseInput.addEventListener('input', () => {
      denoiseValue.textContent = parseFloat(denoiseInput.value).toFixed(2);
    });

    function showLoading(text) {
      loading.classList.add('visible');
      loadingText.textContent = text || 'Generating\u2026';
      errorEl.classList.remove('visible');
      resultImg.classList.remove('visible');
      resultVideo.classList.remove('visible');
      resultAudio.classList.remove('visible');
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
      const lowerUrl = url.toLowerCase();
      const isVideoUrl = lowerUrl.endsWith('.mp4');
      const isAudioUrl = lowerUrl.endsWith('.wav') || lowerUrl.endsWith('.mp3');
      if (isVideoUrl) {
        resultVideo.onerror = () => {
          const err = resultVideo.error;
          const msg = err ? 'Video error (code ' + err.code + '): ' + err.message : 'Unknown video error';
          showError(msg + ' — URL: ' + url);
        };
        resultVideo.src = url;
        resultVideo.load();
        resultVideo.classList.add('visible');
        resultImg.classList.remove('visible');
        resultAudio.classList.remove('visible');
      } else if (isAudioUrl) {
        resultAudio.src = url;
        resultAudio.load();
        resultAudio.classList.add('visible');
        resultImg.classList.remove('visible');
        resultVideo.classList.remove('visible');
      } else {
        resultImg.src = url;
        resultImg.classList.add('visible');
        resultVideo.classList.remove('visible');
        resultAudio.classList.remove('visible');
      }
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
          // result is "data:<mime>;base64,<data>" — strip everything up to and including the first comma
          const result = reader.result;
          const commaIdx = result.indexOf(',');
          const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
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
      const isVideo = modality === 'txt2vid' || modality === 'img2vid';
      const isAudio = modality === 'txt2audio';

      if (!modelId) {
        showError('Please select a model before generating.');
        return;
      }

      showLoading('Submitting job\u2026');

      let jobId;
      try {
        let params;

        if (modality === 'txt2audio') {
          const prompt = document.getElementById('prompt').value.trim();
          const lyrics = document.getElementById('lyrics').value.trim();
          const duration = parseFloat(document.getElementById('audio_duration').value);
          const bpm = parseInt(document.getElementById('bpm').value, 10);
          const steps = parseInt(document.getElementById('steps').value, 10);
          const cfg = parseFloat(document.getElementById('cfg').value);
          const seed = parseInt(document.getElementById('seed').value, 10);
          params = { prompt, duration, bpm, steps, cfg, seed };
          if (lyrics) params.lyrics = lyrics;
        } else if (modality === 'upscale') {
          const fileInput = document.getElementById('upscale_source_image');
          const file = fileInput.files && fileInput.files[0];
          if (!file) {
            hideLoading();
            showError('Please select a source image for upscale.');
            return;
          }
          const base64 = await readFileAsBase64(file);
          // include an explicit empty prompt so worker validation doesn't fail
          params = { prompt: "", source_image: base64 };
        } else if (isVideo) {
          const prompt = document.getElementById('prompt').value.trim();
          const negativePrompt = document.getElementById('negative_prompt').value.trim();
          const width = parseInt(document.getElementById('vid_width').value, 10);
          const height = parseInt(document.getElementById('vid_height').value, 10);
          const duration = parseFloat(document.getElementById('duration').value);
          const steps = parseInt(document.getElementById('steps').value, 10);
          const cfg = parseFloat(document.getElementById('cfg').value);
          const seed = parseInt(document.getElementById('seed').value, 10);
          params = { prompt, width, height, duration, steps, cfg, seed };
          if (negativePrompt) params.negative_prompt = negativePrompt;
        } else {
          const prompt = document.getElementById('prompt').value.trim();
          const negativePrompt = document.getElementById('negative_prompt').value.trim();
          const width = parseInt(document.getElementById('width').value, 10);
          const height = parseInt(document.getElementById('height').value, 10);
          const steps = parseInt(document.getElementById('steps').value, 10);
          const cfg = parseFloat(document.getElementById('cfg').value);
          const seed = parseInt(document.getElementById('seed').value, 10);
          params = { prompt, width, height, steps, cfg, seed };
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
        }

        let inputImage;
        if (modality === 'img2vid') {
          const fileInput = document.getElementById('img2vid_source_image');
          const file = fileInput.files && fileInput.files[0];
          if (file) {
            inputImage = await readFileAsBase64(file);
          } else {
            inputImage = document.getElementById('img2vid_source_url').value.trim();
          }
          if (!inputImage) {
            hideLoading();
            showError('Please provide a source image (file or URL) for img2vid.');
            return;
          }
        }

        const res = await fetch('/v1/jobs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: modality === 'img2vid'
            ? JSON.stringify({ modelId, modality, inputImage, params })
            : JSON.stringify({ modelId, modality, params }),
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

      showLoading(isVideo ? 'Generating video\u2026' : isAudio ? 'Generating audio\u2026' : 'Generating\u2026');

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
        if (!activeEventSource) return; // onmessage already handled the terminal event
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
