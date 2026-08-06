import { hasXaiApiKey, xaiCloudAllowed } from "@/lib/agent/mode";
import {
  archiveWritable,
  getArchiveRoot,
} from "@/lib/acquire/paths";
import { ytDlpAvailable, ytDlpVersion } from "@/lib/acquire/youtube";

export function acquireCapabilities() {
  const yt = ytDlpAvailable();
  return {
    archiveRoot: getArchiveRoot(),
    archiveWritable: archiveWritable(),
    ytDlp: yt,
    ytDlpVersion: yt ? ytDlpVersion() : null,
    grokImage: hasXaiApiKey() && xaiCloudAllowed(),
    hasXaiApiKey: hasXaiApiKey(),
  };
}
