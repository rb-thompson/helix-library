/**
 * Desk capability snapshot — must stay lightweight.
 * Do not import openalex/clip/youtube pipelines here (they pull indexer +
 * reindex into the /acquire RSC graph and make cold compile hang for tens of seconds).
 */

import { hasXaiApiKey, xaiCloudAllowed } from "@/lib/agent/mode";
import {
  archiveWritable,
  getDefaultArchiveRoot,
  listAcquireTargets,
  type AcquireTarget,
} from "@/lib/acquire/paths";
import { ytDlpAvailable, ytDlpVersion } from "@/lib/acquire/yt-dlp-bin";
import { syncLocationsFromConfig } from "@/lib/locations/sync";

function openAlexKeyPresent(): boolean {
  return Boolean(
    process.env.NON_OS_OPENALEX_API_KEY?.trim() ||
      process.env.OPENALEX_API_KEY?.trim(),
  );
}

export type AcquireCapabilities = {
  /** Default destination when no locationId is sent. */
  archiveRoot: string;
  archiveWritable: boolean;
  /** Enabled locations with mount/writable status. */
  targets: AcquireTarget[];
  ytDlp: boolean;
  ytDlpVersion: string | null;
  grokImage: boolean;
  hasXaiApiKey: boolean;
  xaiCloudAllowed: boolean;
  imageModel: string;
  openAlexKey: boolean;
};

export function acquireCapabilities(): AcquireCapabilities {
  try {
    syncLocationsFromConfig();
  } catch {
    // Config/DB may be mid-setup; still return best-effort caps.
  }

  const targets = listAcquireTargets();
  const yt = ytDlpAvailable();
  const keyed = hasXaiApiKey();
  const cloud = xaiCloudAllowed();
  return {
    archiveRoot: getDefaultArchiveRoot(),
    archiveWritable: archiveWritable(),
    targets,
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
