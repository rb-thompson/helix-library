import { writeFile } from "node:fs/promises";
import { hasXaiApiKey, xaiCloudAllowed } from "@/lib/agent/mode";
import {
  fetchSafeOutbound,
  sniffImageExt,
} from "@/lib/acquire/outbound";
import { safeArchivePath, slugify } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";

const DEFAULT_MODEL =
  process.env.NON_OS_IMAGE_MODEL?.trim() || "grok-imagine-image-quality";

const IMAGE_DOWNLOAD_MAX = 25 * 1024 * 1024;
const IMAGE_API_TIMEOUT_MS = 180_000;
const IMAGE_URL_FETCH_TIMEOUT_MS = 60_000;

export type GrokImageResult = {
  path: string;
  relPath: string;
  prompt: string;
  model: string;
  itemId: number | null;
  tags?: string[];
  bytes: number;
};

/** Pure helper — unit-tested with fixture JSON */
export function extractImageBytesFromResponse(data: {
  data?: Array<{ b64_json?: string; url?: string }>;
}): { kind: "b64" | "url"; value: string } {
  const first = data.data?.[0];
  if (!first) throw new Error("No image in xAI response (empty data[])");
  if (first.b64_json?.trim()) return { kind: "b64", value: first.b64_json };
  if (first.url?.trim()) return { kind: "url", value: first.url };
  throw new Error("Image response missing b64_json and url");
}

function mapImageApiError(status: number, body: string, model: string): string {
  const slice = body.slice(0, 400);
  if (status === 401 || status === 403) {
    return `xAI image API rejected the key (${status}): key invalid or lacks Imagine entitlement. ${slice || ""}`.trim();
  }
  if (status === 404) {
    return `xAI image model "${model}" not available (${status}). Override NON_OS_IMAGE_MODEL or try grok-imagine-image. ${slice || ""}`.trim();
  }
  return `xAI image API failed (${status}): ${slice || "unknown error"}`;
}

/**
 * Generate an image via xAI images API and save under archive/images.
 */
export async function acquireGrokImage(promptRaw: string): Promise<GrokImageResult> {
  const prompt = promptRaw.trim();
  if (!prompt) throw new Error("Prompt is required");
  if (prompt.length > 2000) throw new Error("Prompt too long (max 2000 chars)");
  if (!hasXaiApiKey()) {
    throw new Error(
      "XAI_API_KEY is not set. Add a developer key from console.x.ai to generate images. SuperGrok chat alone is not enough.",
    );
  }
  if (!xaiCloudAllowed()) {
    throw new Error(
      "Cloud Grok is disabled (NON_OS_USE_XAI=0). Image generation is unavailable.",
    );
  }

  const apiKey = process.env.XAI_API_KEY!.trim();
  const model = DEFAULT_MODEL;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IMAGE_API_TIMEOUT_MS);
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
    throw new Error(mapImageApiError(res.status, body, model));
  }

  const data = (await res.json()) as {
    data?: Array<{ b64_json?: string; url?: string }>;
  };
  const extracted = extractImageBytesFromResponse(data);

  let buf: Buffer;
  if (extracted.kind === "b64") {
    buf = Buffer.from(extracted.value, "base64");
  } else {
    const fetched = await fetchSafeOutbound(extracted.value, {
      httpsOnly: true,
      timeoutMs: IMAGE_URL_FETCH_TIMEOUT_MS,
      maxBytes: IMAGE_DOWNLOAD_MAX,
      headers: { Accept: "image/*" },
    });
    buf = fetched.buf;
  }

  if (buf.length < 32) throw new Error("Generated image too small");

  const magicExt = sniffImageExt(buf);
  if (!magicExt) {
    throw new Error(
      "Downloaded bytes are not a recognized image (png/jpeg/webp magic)",
    );
  }

  const slug = slugify(prompt) || "image";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `grok-${stamp}-${slug}.${magicExt}`;
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
