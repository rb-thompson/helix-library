import Link from "next/link";
import type { Metadata } from "next";
import { Aperture } from "lucide-react";
import { DeepLensWorkspace } from "@/components/lens/DeepLensWorkspace";
import { getItemText } from "@/lib/catalog/query";
import { getRelatedHoldings } from "@/lib/catalog/related";
import { listInsightsByItem, resolveLensFocus } from "@/lib/lens";
import { getLensAnalysisState } from "@/lib/lens/run-analyze";
import { hasThumb } from "@/lib/media/thumbs";
import { loadMediaPreview } from "@/lib/media/preview";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const focus = resolveLensFocus(id);
  if (focus.status === "ok" || focus.item) {
    const title =
      focus.status === "ok"
        ? focus.title
        : (focus.title ?? `Holding ${id}`);
    return { title: `Deep Lens · ${title}` };
  }
  return { title: "Deep Lens" };
}

export default async function DeepLensFocusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const focus = resolveLensFocus(id);

  if (focus.status === "invalid_id" || focus.status === "not_found") {
    return (
      <div className="space-y-4">
        <LensChrome />
        <div className="surface p-6 sm:p-8">
          <h1 className="text-xl font-semibold text-[var(--ink)]">
            Holding not found
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">{focus.message}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/lens" className="btn btn-primary btn-sm">
              Back to Deep Lens
            </Link>
            <Link href="/catalog" className="btn btn-secondary btn-sm">
              Browse catalog
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const item = focus.item!;
  const title =
    focus.status === "ok" ? focus.title : (focus.title ?? item.name);
  const contentBlockedReason =
    focus.status === "ok" ? null : focus.message;

  const relatedGroups = getRelatedHoldings(item.id);
  const insights = listInsightsByItem(item.id);
  const extracted = getItemText(item.id);
  const analysisState = getLensAnalysisState(item.id);

  const preview =
    focus.status === "disabled_location"
      ? { type: "none" as const, reason: contentBlockedReason ?? "unavailable" }
      : await loadMediaPreview(item);

  return (
    <DeepLensWorkspace
      item={item}
      title={title}
      preview={preview}
      relatedGroups={relatedGroups}
      insights={insights}
      contentBlockedReason={contentBlockedReason}
      indexedBody={extracted?.body ?? null}
      hasThumb={hasThumb(item.id)}
      analysisStatus={analysisState.status}
      analysis={analysisState.analysis}
      analysisJobId={analysisState.jobId}
      agentMode={analysisState.agentMode}
    />
  );
}

function LensChrome() {
  return (
    <div className="flex items-center gap-2">
      <Aperture className="h-5 w-5 text-[var(--accent)]" aria-hidden />
      <p className="eyebrow !mb-0">Deep Lens</p>
    </div>
  );
}
