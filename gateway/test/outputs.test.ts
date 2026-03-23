/** Tests for the /outputs/:filename static artifact serving route. */
import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { app } from "../src/index";

const BASE = "http://localhost";

// Write a real file so Bun.file().exists() returns true
function createTempFile(dir: string, name: string, content: Uint8Array): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

describe("US-003-AC05 GET /outputs/:filename serves WAV with audio/wav content-type", () => {
  const outputDir = join(import.meta.dir, "..", "test-outputs-tmp");
  let createdFiles: string[] = [];

  mkdirSync(outputDir, { recursive: true });

  afterEach(() => {
    for (const f of createdFiles) {
      try {
        rmSync(f);
      } catch {
        /* ignore */
      }
    }
    createdFiles = [];
  });

  test("AC05: .wav file is served with Content-Type: audio/wav", async () => {
    const wavBytes = new Uint8Array([
      0x52,
      0x49,
      0x46,
      0x46,
      0x24,
      0x00,
      0x00,
      0x00, // RIFF....
      0x57,
      0x41,
      0x56,
      0x45,
      0x66,
      0x6d,
      0x74,
      0x20, // WAVEfmt
      0x10,
      0x00,
      0x00,
      0x00,
      0x01,
      0x00,
      0x01,
      0x00, // ..PCM mono
      0x80,
      0xbb,
      0x00,
      0x00,
      0x00,
      0x77,
      0x01,
      0x00, // 48000 Hz
      0x02,
      0x00,
      0x10,
      0x00,
      0x64,
      0x61,
      0x74,
      0x61, // ..data
      0x00,
      0x00,
      0x00,
      0x00,
    ]);
    const filePath = createTempFile(outputDir, "test-job.wav", wavBytes);
    createdFiles.push(filePath);

    const origEnv = process.env.OUTPUT_DIR;
    process.env.OUTPUT_DIR = outputDir;

    try {
      const res = await app.handle(new Request(`${BASE}/outputs/test-job.wav`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("audio/wav");
    } finally {
      if (origEnv === undefined) delete process.env.OUTPUT_DIR;
      else process.env.OUTPUT_DIR = origEnv;
    }
  });

  test("AC05: missing .wav file returns 404", async () => {
    const origEnv = process.env.OUTPUT_DIR;
    process.env.OUTPUT_DIR = outputDir;

    try {
      const res = await app.handle(new Request(`${BASE}/outputs/nonexistent-00000000.wav`));
      expect(res.status).toBe(404);
    } finally {
      if (origEnv === undefined) delete process.env.OUTPUT_DIR;
      else process.env.OUTPUT_DIR = origEnv;
    }
  });

  test("AC05: .png file is still served with image/png", async () => {
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const filePath = createTempFile(outputDir, "test-img.png", pngBytes);
    createdFiles.push(filePath);

    const origEnv = process.env.OUTPUT_DIR;
    process.env.OUTPUT_DIR = outputDir;

    try {
      const res = await app.handle(new Request(`${BASE}/outputs/test-img.png`));
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
    } finally {
      if (origEnv === undefined) delete process.env.OUTPUT_DIR;
      else process.env.OUTPUT_DIR = origEnv;
    }
  });
});
