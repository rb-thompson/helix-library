import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, MessageSquareText } from "lucide-react";
import { CopyPathButton } from "@/components/CopyPathButton";
import { ExifPanel } from "@/components/ExifPanel";
import { ExtractedTextPanel } from "@/components/ExtractedTextPanel";
import { ItemCuration } from "@/components/ItemCuration";
import { ItemMediaViewer } from "@/components/ItemMediaViewer";
import { KindBadge } from "@/components/KindBadge";
import { VideoThumbEditor } from "@/components/VideoThumbEditor";
import { getItemById, getItemText, searchCatalog } from "@/lib/catalog/query";
import { getRelatedHoldings } from "@/lib/catalog/related";
import {
  getItemCollections,
  getItemTags,
  listCollectionItems,
  listCollections,
} from "@/lib/collections/manage";
import { ItemTitleEditor } from "@/components/ItemTitleEditor";
import { OpenHistoryRecorder } from "@/components/OpenHistoryRecorder";
import { RelatedHoldingsPanel } from "@/components/RelatedHoldingsPanel";
import { displayTitle } from "@/lib/catalog/display";
import { formatBytes, formatDate } from "@/lib/format";
import { hasThumb } from "@/lib/media/thumbs";
import { readExif } from "@/lib/media/exif";
import { loadMediaPreview } from "@/lib/media/preview";
import { resolveMediaItem } from "@/lib/media/serve";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const item = getItemById(Number(id));
  return { title: item ? displayTitle(item) : "Item" };
}

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ collection?: string; room?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const item = getItemById(Number(id));
  if (!item) notFound();

  const focusRoom = sp.room === "1";

  // Manual shelves only for “add to collection” (smart is query-backed)
  const collections = listCollections()
    .filter((c) => c.kind === "manual")
    .map((c) => ({
      id: c.id,
      name: c.name,
    }));
  const itemCollections = getItemCollections(item.id);
  const itemTags = getItemTags(item.id);
  const extracted = getItemText(item.id);
  const relatedGroups = focusRoom ? [] : getRelatedHoldings(item.id);
  const preview = await loadMediaPreview(item);
  const showExtractedPanel =
    !focusRoom &&
    extracted != null &&
    (item.kind === "text" ||
      item.kind === "code" ||
      item.kind === "document" ||
      item.mime === "application/pdf");

  // Neighbors for lightbox: collection if specified, else same kind recent
  let neighbors: { id: number; name: string; kind: string }[] = [];
  const colId = sp.collection ? Number(sp.collection) : NaN;
  if (Number.isFinite(colId)) {
    neighbors = listCollectionItems(colId)
      .filter(
        (i) =>
          i.kind === "image" || i.kind === "video" || i.kind === "audio",
      )
      .map((i) => ({ id: i.id, name: i.name, kind: i.kind }));
  }
  if (neighbors.length === 0) {
    const sameKind = searchCatalog({
      kind: item.kind === "image" || item.kind === "video" || item.kind === "audio"
        ? item.kind
        : "",
      pageSize: 40,
    });
    neighbors = sameKind.items
      .filter(
        (i) =>
          i.kind === "image" || i.kind === "video" || i.kind === "audio",
      )
      .map((i) => ({ id: i.id, name: i.name, kind: i.kind }));
  }
  if (!neighbors.some((n) => n.id === item.id)) {
    neighbors = [
      { id: item.id, name: item.name, kind: item.kind },
      ...neighbors,
    ];
  }

  const resolved = resolveMediaItem(item.id);
  const exif =
    resolved &&
    (item.kind === "image" || item.kind === "video" || item.kind === "audio")
      ? readExif(resolved.absPath)
      : {
          available: false as const,
          reason: "EXIF applies to image/video/audio files on disk.",
        };

  const duration =
    item.durationMs != null
      ? `${(item.durationMs / 1000).toFixed(1)}s`
      : "—";
  const dims =
    item.width != null && item.height != null
      ? `${item.width} × ${item.height}`
      : "—";

  const fields: { label: string; value: string }[] = [
    { label: "Title", value: displayTitle(item) },
    { label: "Filename", value: item.name },
    { label: "Location", value: item.locationName },
    { label: "Relative path", value: item.relPath },
    { label: "Absolute path", value: item.path },
    { label: "Kind", value: item.kind },
    { label: "MIME", value: item.mime ?? "—" },
    { label: "Extension", value: item.ext ?? "—" },
    { label: "Size", value: formatBytes(item.sizeBytes) },
    { label: "Dimensions", value: dims },
    { label: "Duration", value: duration },
    { label: "Modified", value: formatDate(item.mtimeMs) },
    { label: "Created (fs)", value: formatDate(item.ctimeMs) },
    { label: "Indexed", value: formatDate(item.indexedAt) },
    { label: "Content hash", value: item.contentHash ?? "—" },
    {
      label: "Status",
      value: item.isMissing ? "Missing on disk" : "Present",
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <OpenHistoryRecorder
        id={item.id}
        name={displayTitle(item)}
        kind={item.kind}
      />
      <Link
        href="/catalog"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Catalog
      </Link>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="break-words text-xl font-semibold tracking-tight text-[var(--ink)] sm:text-2xl">
              {displayTitle(item)}
            </h1>
            {displayTitle(item) !== item.name ? (
              <p className="mt-1 font-mono text-xs text-[var(--muted)]">
                {item.name}
              </p>
            ) : null}
            <KindBadge kind={item.kind} />
            {item.isMissing ? (
              <span className="text-xs font-semibold text-[var(--danger)]">
                Missing on disk
              </span>
            ) : null}
          </div>
          <p className="mt-2 flex items-start gap-1.5 font-mono text-xs text-[var(--muted)] sm:text-sm">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
            <span className="break-all">{item.path}</span>
          </p>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <CopyPathButton path={item.path} />
          <Link
            href={`/ask?item=${item.id}`}
            className="btn btn-secondary btn-sm inline-flex items-center justify-center gap-1.5"
            title="Ask the Librarian about this holding"
          >
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
            Ask about this holding
          </Link>
          <ItemTitleEditor
            itemId={item.id}
            displayTitle={displayTitle(item)}
            filename={item.name}
          />
        </div>
      </div>

      <ItemMediaViewer
        item={item}
        preview={preview}
        neighbors={neighbors}
        focusRoom={focusRoom}
        indexedBody={extracted?.body ?? null}
      />

      {item.kind === "video" && !item.isMissing && !focusRoom ? (
        <VideoThumbEditor
          itemId={item.id}
          durationMs={item.durationMs}
          hasThumb={hasThumb(item.id)}
        />
      ) : null}

      {/* Focus room: hide secondary chrome (metadata / curation) for reading. */}
      <div
        className={`grid gap-4 sm:gap-5 lg:grid-cols-3 ${
          focusRoom ? "hidden" : ""
        }`}
      >
        <div className="min-w-0 space-y-4 sm:space-y-5 lg:col-span-2">
          <div className="surface p-4 sm:p-5">
            <h2 className="label-quiet !mb-0">Metadata</h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.label} className="surface-inset px-3 py-2">
                  <dt className="label-quiet !mb-0.5">{f.label}</dt>
                  <dd className="break-all text-sm text-[var(--ink)]">
                    {f.value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-[var(--muted)]">
              Media streams via catalog id (localhost). Fullscreen: ← → among
              similar holdings. Text/code holdings open in the reading room
              with scroll memory; use Focus room for a taller view.
            </p>
          </div>

          <ExifPanel result={exif} />

          {showExtractedPanel && extracted ? (
            <ExtractedTextPanel
              body={extracted.body}
              kindLabel={
                item.kind === "document" || item.mime === "application/pdf"
                  ? "Indexed PDF text"
                  : item.kind === "code"
                    ? "Indexed source sample"
                    : "Indexed text sample"
              }
            />
          ) : null}

          <RelatedHoldingsPanel groups={relatedGroups} />
        </div>

        <ItemCuration
          itemId={item.id}
          collections={collections}
          itemCollections={itemCollections}
          itemTags={itemTags}
        />
      </div>
    </div>
  );
}
