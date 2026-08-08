/**
 * Desk capability snapshot — must stay lightweight.
 * Do not import openalex/clip/youtube pipelines here (they pull indexer +
 * reindex into the /acquire RSC graph and make cold compile hang for tens of seconds).
 */

import { hasXaiApiKey, xaiCloudAllowed } from "@/lib/agent/mode";
import {
  archiveWritable,
  getArchiveRoot,
} from "@/lib/acquire/paths";
import { ytDlpAvailable, ytDlpVersion } from "@/lib/acquire/yt-dlp-bin";

function openAlexKeyPresent(): boolean {
  return Boolean(
    process.env.NON_OS_OPENALEX_API_KEY?.trim() ||
      process.env.OPENALEX_API_KEY?.trim(),
  );
}

export function acquireCapabilities() {
  const yt = ytDlpAvailable();
  const keyed = hasXaiApiKey();
  const cloud = xaiCloudAllowed();
  return {
    archiveRoot: getArchiveRoot(),
    archiveWritable: archiveWritable(),
    ytDlp: yt,
    ytDlpVersion: yt ? ytDlpVersion() : null,
    grokImage: keyed && cloud,
    hasXaiApiKey: keyed,
    xaiCloudAllowed: cloud,
    imageModel:
      process.env.NON_OS_IMAGE_MODEL?.trim() || "grok-imagine-image-quality",
    openAlexKey: openAlexKeyPresent(),
  };
}
