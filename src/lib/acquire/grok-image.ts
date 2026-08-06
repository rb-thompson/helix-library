import { writeFile } from "node:fs/promises";
import { hasXaiApiKey } from "@/lib/agent/mode";
import { safeArchivePath, slugify } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";

const DEFAULT_MODEL =
  process.env.NON_OS_IMAGE_MODEL?.trim() || "grok-imagine-image";

export type GrokImageResult = {
  path: string;
  relPath: string;
  prompt: string;
  model: string;
  itemId: number | null;
  tags?: string[];
  bytes: number;
};

/**
 * Generate an image via xAI images API and save under archive/images.
 */
export async function acquireGrokImage(promptRaw: string): Promise<GrokImageResult> {
  const prompt = promptRaw.trim();
  if (!prompt) throw new Error("Prompt is required");
  if (prompt.length > 2000) throw new Error("Prompt too long (max 2000 chars)");
  if (!hasXaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add a developer key from console.x.ai to generate images.",
    );
  }

  const apiKey = process.env.XAI_API_KEY!.trim();
  const model = DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
  let res: Response;
  try {
    res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        response_format: "b64_json",
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `xAI image API failed (${res.status}): ${body.slice(0, 400) || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const first = data.data?.[0];
  if (!first) throw new Error("No image in xAI response");

  let buf: Buffer;
  if (first.b64_json) {
    buf = Buffer.from(first.b64_json, "base64");
  } else if (first.url) {
    const imgRes = await fetch(first.url);
    if (!imgRes.ok) throw new Error("Failed to download generated image URL");
    buf = Buffer.from(await imgRes.arrayBuffer());
  } else {
    throw new Error("Image response missing b64_json and url");
  }

  if (buf.length < 32) throw new Error("Generated image too small");

  const slug = slugify(prompt) || "image";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  // Detect simple magic
  let ext = "png";
  if (buf[0] === 0xff && buf[1] === 0xd8) ext = "jpg";
  else if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46
  ) {
    ext = "webp";
  }
  const filename = `grok-${stamp}-${slug}.${ext}`;
  const dest = safeArchivePath("images", filename);
  await writeFile(dest, buf);

  const indexed = await indexAfterAcquire(dest, { source: "image" });
  return {
    path: dest,
    relPath: `images/${filename}`,
    prompt,
    model,
    itemId: indexed.itemId,
    tags: indexed.tags,
    bytes: buf.length,
  };
}
