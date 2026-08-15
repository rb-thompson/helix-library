import { LensTerminal } from "@/components/lens/LensTerminal";
import type { RelatedGroup } from "@/lib/catalog/related";
import type {
  LensAnalysisRowView,
  LensAnalysisTopStatus,
} from "@/lib/lens/dossier";
import type { Insight } from "@/lib/lens/insights";
import type { MediaPreview } from "@/lib/media/preview-types";
import type { CatalogItemRow } from "@/lib/types";

/**
 * Deep Lens focus surface — encyclopedia / info-terminal dossier.
 */
export function DeepLensWorkspace({
  item,
  title,
  preview,
  relatedGroups,
  insights,
  contentBlockedReason,
  indexedBody,
  hasThumb,
  analysisStatus,
  analysis,
  analysisJobId,
  agentMode,
}: {
  item: CatalogItemRow;
  title: string;
  preview: MediaPreview;
  relatedGroups: RelatedGroup[];
  insights: Insight[];
  contentBlockedReason?: string | null;
  indexedBody?: string | null;
  hasThumb: boolean;
  analysisStatus: LensAnalysisTopStatus;
  analysis: LensAnalysisRowView | null;
  analysisJobId: number | null;
  agentMode: "local" | "xai";
}) {
  return (
    <LensTerminal
      item={item}
      title={title}
      preview={preview}
      relatedGroups={relatedGroups}
      insights={insights}
      contentBlockedReason={contentBlockedReason}
      indexedBody={indexedBody}
      hasThumb={hasThumb}
      analysisStatus={analysisStatus}
      analysis={analysis}
      analysisJobId={analysisJobId}
      agentMode={agentMode}
    />
  );
}
