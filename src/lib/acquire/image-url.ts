/**
 * Acquire a remote image by URL into archive/images (found, not generated).
 */

import { writeFile } from "node:fs/promises";
import {
  fetchSafeOutbound,
  sniffImageExt,
} from "@/lib/acquire/outbound";
import { safeArchivePath, slugify } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import { isCancelRequested } from "@/lib/jobs/store";

const MAX_BYTES = 25 * 1024 * 1024;
const TIMEOUT_MS = 60_000;

export type ImageUrlAcquireResult = {
  sourceUrl: string;
  path: string;
  relPath: string;
  bytes: number;
  itemId: number | null;
  tags?: string[];
  ext: string;
};

type ProgressCb = (p: {
  stage: string;
  percent: number | null;
  detail?: string;
}) => void;

export async function acquireImageUrl(
  urlRaw: string,
  onProgress?: ProgressCb,
  opts?: { jobId?: number; filenameHint?: string },
): Promise<ImageUrlAcquireResult> {
  const checkCancel = () => {
    if (opts?.jobId != null && isCancelRequested(opts.jobId)) {
      throw new Error("Cancelled");
    }
  };

  const raw = urlRaw.trim();
  if (!raw) throw new Error("Image URL is required");

  onProgress?.({
    stage: "downloading",
    percent: 15,
    detail: "Downloading image…",
  });
  checkCancel();

  const fetched = await fetchSafeOutbound(raw, {
    httpsOnly: true,
    timeoutMs: TIMEOUT_MS,
    maxBytes: MAX_BYTES,
    headers: {
      Accept: "image/*,*/*;q=0.1",
      "User-Agent": "HelixLibrary/0.1 (personal OPAC; localhost)",
    },
    onProgress: (received, total) => {
      if (total && total > 0) {
        onProgress?.({
          stage: "downloading",
          percent: 15 + Math.round((received / total) * 60),
          detail: `${Math.round(received / 1024)} / ${Math.round(total / 1024)} KB`,
        });
      }
    },
  });

  checkCancel();
  const buf = fetched.buf;
  if (buf.length < 32) throw new Error("Downloaded image too small");

  const ext = sniffImageExt(buf);
  if (!ext) {
    throw new Error(
      "URL did not return a recognized image (png/jpeg/webp magic)",
    );
  }

  const hint =
    opts?.filenameHint?.trim() ||
    (() => {
      try {
        const u = new URL(fetched.finalUrl);
        const base = u.pathname.split("/").pop() || "image";
        return base.replace(/\.[a-z0-9]+$/i, "");
      } catch {
        return "image";
      }
    })();
  const slug = slugify(hint) || "image";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `url-${stamp}-${slug}.${ext}`;
  const dest = safeArchivePath("images", filename);

  onProgress?.({
    stage: "writing",
    percent: 85,
    detail: "Writing to archive…",
  });
  await writeFile(dest, buf);

  onProgress?.({
    stage: "reindexing",
    percent: 92,
    detail: "Indexing & applying tags…",
  });
  checkCancel();

  const indexed = await indexAfterAcquire(dest, { source: "image_url" });

  return {
    sourceUrl: fetched.finalUrl,
    path: dest,
    relPath: `images/${filename}`,
    bytes: buf.length,
    itemId: indexed.itemId,
    tags: indexed.tags,
    ext,
  };
}
