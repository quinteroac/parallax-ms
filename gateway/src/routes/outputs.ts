/** Serves generated image artifacts from the shared OUTPUT_DIR. */
import { Elysia } from "elysia";
import { join } from "node:path";

export const outputsRoutes = new Elysia().get(
  "/outputs/:filename",
  async ({ params, set }) => {
    const outputDir = process.env.OUTPUT_DIR ?? "./outputs";
    const filePath = join(outputDir, params.filename);
    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      set.status = 404;
      return { error: "not found" };
    }
    // Return BunFile directly so Bun handles range requests (HTTP 206) automatically.
    // Range support is required for browsers to seek/play MP4 video.
    let contentType = "image/png";
    if (params.filename.endsWith(".mp4")) contentType = "video/mp4";
    else if (params.filename.endsWith(".wav")) contentType = "audio/wav";
    return new Response(file, { headers: { "content-type": contentType } });
  },
  { detail: { summary: "Serve a generated media artifact" } },
);
