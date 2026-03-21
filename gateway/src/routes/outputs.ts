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
    const contentType = params.filename.endsWith(".mp4") ? "video/mp4" : "image/png";
    return new Response(file, { headers: { "content-type": contentType } });
  },
  { detail: { summary: "Serve a generated image artifact" } },
);
