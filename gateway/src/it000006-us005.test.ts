import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { app } from "./index";

const BASE = "http://localhost";
const gatewayRoot = join(import.meta.dir, "..");

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

  test("US-005: typecheck passes", () => {
    const result = Bun.spawnSync(["bun", "run", "typecheck"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });

  test("US-005: lint passes", () => {
    const result = Bun.spawnSync(["bun", "run", "lint"], {
      cwd: gatewayRoot,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.exitCode, result.stderr.toString()).toBe(0);
  });
});
