import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "../src/index";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

// ---------- basic playground structure ----------

describe("US-006 Basic playground page for manual testing", () => {
  // ---------- AC01 ----------

  test("US-006-AC01: GET /playground returns 200 with text/html content type", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  // ---------- AC02 ----------

  test("US-006-AC02: page contains Prompt text input", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="prompt"');
    expect(body).toContain('type="text"');
  });

  test("US-006-AC02: page contains Negative prompt text input (optional)", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="negative_prompt"');
  });

  test("US-006-AC02: page contains Steps number input with default 20", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="steps"');
    expect(body).toContain('type="number"');
    expect(body).toMatch(/id="steps"[^>]*value="20"|value="20"[^>]*id="steps"/);
  });

  test("US-006-AC02: page contains Seed number input with default 0", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="seed"');
    expect(body).toMatch(/id="seed"[^>]*value="0"|value="0"[^>]*id="seed"/);
  });

  // ---------- AC03 ----------

  test("US-006-AC03: page contains a submit button", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('type="submit"');
  });

  test("US-006-AC03: page includes script that calls /v1/jobs on submit", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("/v1/jobs");
    expect(body).toContain("EventSource");
    expect(body).toContain("jobId");
  });

  test("US-006-AC03: page includes loading indicator element", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="loading"');
  });

  // ---------- AC04 ----------

  test("US-006-AC04: page includes an image element to display result", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="result"');
    expect(body).toContain("<img");
  });

  test("US-006-AC04: script handles succeeded SSE event and sets image src", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("succeeded");
    expect(body).toContain("payload.url");
    expect(body).toContain("showResult");
  });

  // ---------- AC05 ----------

  test("US-006-AC05: page includes an error display element", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="error"');
  });

  test("US-006-AC05: script handles failed SSE event and shows error", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("failed");
    expect(body).toContain("showError");
  });

  test("US-006-AC05: script handles EventSource onerror", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("onerror");
  });
});

// ---------- model selection and img2img ----------

describe("US-005 Playground supports model selection and img2img", () => {
  // ---------- AC01: model selector populated from GET /v1/models ----------

  test("US-005-AC01: page contains a select element with id 'model-select'", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="model-select"');
    expect(body).toContain("<select");
  });

  test("US-005-AC01: script fetches /v1/models on load and populates select options", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("/v1/models");
    expect(body).toContain("opt.value = m.id");
    expect(body).toContain("opt.textContent = m.name");
    expect(body).toContain("modelSelect.appendChild(opt)");
  });

  // ---------- AC02: mode toggle ----------

  test("US-005-AC02: page contains radio inputs for txt2img and img2img modes", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('value="txt2img"');
    expect(body).toContain('value="img2img"');
    expect(body).toContain('type="radio"');
    expect(body).toContain('name="modality"');
  });

  test("US-005-AC02: txt2img is the default checked mode", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toMatch(/id="mode-txt2img"[^>]*checked|checked[^>]*id="mode-txt2img"/);
  });

  test("US-005-AC02: script updates visible fields when mode changes", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("mode-img2img");
    expect(body).toContain("img2imgFields");
    expect(body).toContain("classList.add('visible')");
    expect(body).toContain("classList.remove('visible')");
  });

  // ---------- AC03: img2img file input ----------

  test("US-005-AC03: page contains a file input for source image in img2img section", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="source_image"');
    expect(body).toContain('type="file"');
    expect(body).toContain('accept="image/*"');
  });

  test("US-005-AC03: script reads file via FileReader and sends as base64 source_image", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("FileReader");
    expect(body).toContain("readAsDataURL");
    expect(body).toContain("source_image");
    expect(body).toContain("base64");
  });

  // ---------- AC04: denoise_strength range input ----------

  test("US-005-AC04: page contains a range input for denoise_strength", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="denoise_strength"');
    expect(body).toContain('type="range"');
  });

  test("US-005-AC04: denoise_strength range has correct min=0, max=1, step=0.05, default=0.75", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toMatch(/id="denoise_strength"[^>]*min="0"/);
    expect(body).toMatch(/id="denoise_strength"[^>]*max="1"/);
    expect(body).toMatch(/id="denoise_strength"[^>]*step="0\.05"/);
    expect(body).toMatch(/id="denoise_strength"[^>]*value="0\.75"/);
  });

  test("US-005-AC04: denoise_strength is included in params for img2img", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("denoise_strength");
    expect(body).toContain("params.denoise_strength");
  });

  test("US-005-AC04: img2img fields (source image + denoise) are inside the img2img section", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="img2img-fields"');
    // The img2img fields div contains both source_image and denoise_strength
    const img2imgStart = body.indexOf('id="img2img-fields"');
    const img2imgEnd = body.indexOf("</div>", img2imgStart + 200);
    const section = body.slice(img2imgStart, img2imgEnd + 1000);
    expect(section).toContain('id="source_image"');
    expect(section).toContain('id="denoise_strength"');
  });

  // ---------- AC05: form submits { modelId, modality, params } ----------

  test("US-005-AC05: script submits { modelId, modality, params } to POST /v1/jobs", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("modelId");
    expect(body).toContain("modality");
    expect(body).toContain("params");
    expect(body).toContain("JSON.stringify({ modelId, modality, params })");
  });

  test("US-005-AC05: SSE handling and image display are preserved", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("EventSource");
    expect(body).toContain("jobId");
    expect(body).toContain("succeeded");
    expect(body).toContain("showResult");
    expect(body).toContain('id="result"');
  });

  // ---------- typecheck / lint ----------
});

// ---------- video mode ----------

describe("US-005 Playground supports video mode", () => {
  // ---------- AC01: model selector filters video-capable models ----------

  test("US-005-AC01: populateModelSelect filters by txt2vid modality", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("modality === 'txt2vid' || modality === 'img2vid'");
    expect(body).toContain("m.modalities && m.modalities.includes(modality)");
  });

  // ---------- AC02: video modality options are present ----------

  test("US-005-AC02: page contains radio inputs for txt2vid and img2vid modes", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('value="txt2vid"');
    expect(body).toContain('value="img2vid"');
    expect(body).toContain('id="mode-txt2vid"');
    expect(body).toContain('id="mode-img2vid"');
  });

  test("US-005-AC02: script shows vid-fields and hides generation-fields when video mode is selected", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("vidFields");
    expect(body).toContain("isVideo");
    expect(body).toContain("vid-fields");
  });

  // ---------- AC03: img2vid shows image upload and URL input ----------

  test("US-005-AC03: page contains file input for img2vid source image", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="img2vid_source_image"');
    expect(body).toContain('id="img2vid-source"');
  });

  test("US-005-AC03: page contains URL text input for img2vid source image", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="img2vid_source_url"');
  });

  test("US-005-AC03: img2vid-source section is shown/hidden based on img2vid mode", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("img2vidSource");
    expect(body).toContain("isImg2vid");
  });

  // ---------- AC04: width, height, duration inputs ----------

  test("US-005-AC04: page contains vid_width and vid_height inputs in vid-fields", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="vid_width"');
    expect(body).toContain('id="vid_height"');
    const vidFieldsStart = body.indexOf('id="vid-fields"');
    const vidFieldsEnd = body.indexOf('id="submit-btn"');
    const section = body.slice(vidFieldsStart, vidFieldsEnd);
    expect(section).toContain('id="vid_width"');
    expect(section).toContain('id="vid_height"');
    expect(section).toContain('id="duration"');
  });

  test("US-005-AC04: duration input is present with numeric type", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="duration"');
    expect(body).toMatch(/id="duration"[^>]*type="number"|type="number"[^>]*id="duration"/);
  });

  test("US-005-AC04: script reads vid_width, vid_height, and duration for video jobs", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("vid_width");
    expect(body).toContain("vid_height");
    expect(body).toContain("duration");
    expect(body).toContain("params = { prompt, width, height, duration }");
  });

  // ---------- AC05: video element renders MP4 result ----------

  test("US-005-AC05: page contains a video element with id result-video", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="result-video"');
    expect(body).toContain("<video");
  });

  test("US-005-AC05: showResult sets video src and shows video element for MP4 URLs", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("isVideoUrl");
    expect(body).toContain(".endsWith('.mp4')");
    expect(body).toContain("resultVideo.src = url");
    expect(body).toContain("resultVideo");
  });

  test("US-005-AC05: showResult still handles image URLs with the img element", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("resultImg.src = url");
    expect(body).toContain('id="result"');
  });

  // ---------- img2vid submits inputImage at top level ----------

  test("US-005: img2vid job sends inputImage at top level of request body", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("modality === 'img2vid'");
    expect(body).toContain("inputImage");
    expect(body).toContain("JSON.stringify({ modelId, modality, inputImage, params })");
  });
});

// ---------- upscale mode ----------

describe("US-004 Playground supports upscale mode", () => {
  // ---------- AC01: mode toggle has upscale option ----------

  test("US-004-AC01: mode toggle contains txt2img, img2img, and upscale radio options", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('value="txt2img"');
    expect(body).toContain('value="img2img"');
    expect(body).toContain('value="upscale"');
    expect(body).toContain('id="mode-upscale"');
  });

  // ---------- AC02: upscale shows source image, hides generation fields ----------

  test("US-004-AC02: page has generation-fields div that is hidden when upscale is active", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="generation-fields"');
    expect(body).toContain("generationFields");
    expect(body).toContain("classList.add('hidden')");
    expect(body).toContain("classList.remove('hidden')");
  });

  test("US-004-AC02: upscale mode hides prompt, negative_prompt, width, height, steps, cfg, seed inside generation-fields", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    // All these fields should be inside generation-fields div
    const genStart = body.indexOf('id="generation-fields"');
    const genEnd = body.indexOf('id="upscale-fields"');
    const section = body.slice(genStart, genEnd);
    expect(section).toContain('id="prompt"');
    expect(section).toContain('id="negative_prompt"');
    expect(section).toContain('id="width"');
    expect(section).toContain('id="height"');
    expect(section).toContain('id="steps"');
    expect(section).toContain('id="cfg"');
    expect(section).toContain('id="seed"');
    expect(section).toContain('id="denoise_strength"');
  });

  test("US-004-AC02: upscale-fields section contains source image file input", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain('id="upscale-fields"');
    const upscaleStart = body.indexOf('id="upscale-fields"');
    const upscaleEnd = body.indexOf("</div>", upscaleStart + 100);
    const section = body.slice(upscaleStart, upscaleEnd + 500);
    expect(section).toContain('id="upscale_source_image"');
    expect(section).toContain('type="file"');
    expect(section).toContain('accept="image/*"');
  });

  test("US-004-AC02: script shows upscale-fields and hides generation-fields when upscale is selected", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("upscaleFields");
    expect(body).toContain("isUpscale");
  });

  // ---------- AC03: model selector filters to upscale models ----------

  test("US-004-AC03: script filters model selector to upscale models when upscale mode is active", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("populateModelSelect");
    expect(body).toContain("modality === 'upscale'");
    expect(body).toContain("m.modalities && m.modalities.includes('upscale')");
  });

  // ---------- AC04: upscale job POSTs { modelId, modality: "upscale", params: { source_image } } ----------

  test("US-004-AC04: script submits upscale job with modality=upscale and source_image param", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("modality === 'upscale'");
    expect(body).toContain("upscale_source_image");
    expect(body).toContain("params = { source_image: base64 }");
    expect(body).toContain("JSON.stringify({ modelId, modality, params })");
  });

  // ---------- AC05 & AC06: result image and error display ----------

  test("US-004-AC05: result image is displayed on job completion (showResult)", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("showResult");
    expect(body).toContain("payload.url");
    expect(body).toContain('id="result"');
  });

  test("US-004-AC06: error message is displayed on job failure (showError)", async () => {
    const res = await app.handle(new Request(`${BASE}/playground`));
    const body = await res.text();
    expect(body).toContain("showError");
    expect(body).toContain("payload.error");
    expect(body).toContain('id="error"');
  });

  // ---------- typecheck / lint ----------

  test("typecheck and lint pass", () => {
    const typecheck = Bun.spawnSync(["bun", "run", "typecheck"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(typecheck.exitCode, typecheck.stderr.toString()).toBe(0);

    const lint = Bun.spawnSync(["bun", "run", "lint"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(lint.exitCode, lint.stderr.toString()).toBe(0);
  });
});
