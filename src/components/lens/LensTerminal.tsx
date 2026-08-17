"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  MessageSquareText,
  Network,
  RefreshCw,
  Sparkles,
  Tag,
} from "lucide-react";
import { InsightPanel } from "@/components/lens/InsightPanel";
import { ItemMediaViewer } from "@/components/ItemMediaViewer";
import { KindBadge } from "@/components/KindBadge";
import { KindPoster } from "@/components/lens/KindPoster";
import { RelatedHoldingsPanel } from "@/components/RelatedHoldingsPanel";
import { useLensAnalysis } from "@/lib/client/use-lens-analysis";
import { formatBytes, formatDate, kindLabel } from "@/lib/format";
import { kindObjectSpec } from "@/lib/lens/kind-object";
import type { RelatedGroup } from "@/lib/catalog/related";
import type {
  LensAnalysisRowView,
  LensAnalysisTopStatus,
} from "@/lib/lens/dossier";
import type { Insight } from "@/lib/lens/insights";
import type { MediaPreview } from "@/lib/media/preview-types";
import type { CatalogItemRow } from "@/lib/types";

type TabId = "article" | "source" | "neighbors" | "notes";

const TABS: { id: TabId; label: string; key: string }[] = [
  { id: "article", label: "Article", key: "1" },
  { id: "source", label: "Source", key: "2" },
  { id: "neighbors", label: "Neighbors", key: "3" },
  { id: "notes", label: "Notes", key: "4" },
];

/**
 * Encyclopedia / info-terminal presentation for one holding.
 */
export function LensTerminal({
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
  const [tab, setTab] = useState<TabId>("article");
  const [clock, setClock] = useState("");
  const spec = kindObjectSpec(item.kind);
  const askHref = `/ask?item=${item.id}`;
  const catalogHref = `/catalog/${item.id}`;
  const graphHref = `/graph?q=${encodeURIComponent(title.slice(0, 80))}`;

  const lens = useLensAnalysis({
    itemId: item.id,
    initialStatus: analysisStatus,
    initialAnalysis: analysis,
    initialJobId: analysisJobId,
    agentMode,
  });

  const payload = lens.analysis?.payload ?? null;
  const kindVar = `var(--kind-${item.kind})`;

  useEffect(() => {
    const tick = () =>
      setClock(
        new Date().toLocaleTimeString(undefined, { hour12: false }),
      );
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" ||
          e.target.tagName === "TEXTAREA" ||
          e.target.isContentEditable)
      ) {
        return;
      }
      const hit = TABS.find((t) => t.key === e.key);
      if (hit) {
        e.preventDefault();
        setTab(hit.id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const neighborCount = useMemo(
    () => relatedGroups.reduce((n, g) => n + g.items.length, 0),
    [relatedGroups],
  );

  const facts = [
    { label: "Kind", value: kindLabel(item.kind) },
    { label: "Call no.", value: String(item.id) },
    { label: "Size", value: formatBytes(item.sizeBytes) },
    { label: "Branch", value: item.locationName },
    { label: "Path", value: item.relPath },
    { label: "MIME", value: item.mime ?? "—" },
    { label: "Modified", value: formatDate(item.mtimeMs) },
    {
      label: "Status",
      value: item.isMissing ? "Missing on disk" : "Present",
    },
  ];

  return (
    <article
      className="lens-term"
      style={{ ["--lens-kind" as string]: kindVar }}
    >
      <header className="lens-term-chrome">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <strong>Helix // Deep Lens</strong>
          <span>holding {String(item.id).padStart(4, "0")}</span>
          <span>{spec.label}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="lens-term-live">live</span>
          <span className="tabular-nums">{clock}</span>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-3 py-2 sm:px-4">
        <Link
          href="/lens"
          className="font-mono text-[0.7rem] uppercase tracking-wider text-[var(--muted)] hover:text-[var(--accent)]"
        >
          ← Index
        </Link>
        <div className="flex flex-wrap gap-1.5">
          <Link href={askHref} className="btn btn-primary btn-sm gap-1.5">
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
            Ask
          </Link>
          <Link href={catalogHref} className="btn btn-secondary btn-sm gap-1.5">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Record
          </Link>
          <Link href={graphHref} className="btn btn-secondary btn-sm gap-1.5">
            <Network className="h-3.5 w-3.5" aria-hidden />
            Map
          </Link>
        </div>
      </div>

      <nav className="lens-term-tabs" role="tablist" aria-label="Dossier sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="lens-term-tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            <span className="lens-term-k">{t.key}</span>
            {t.label}
            {t.id === "neighbors" && neighborCount > 0 ? (
              <span className="ml-1 tabular-nums opacity-60">
                {neighborCount}
              </span>
            ) : null}
            {t.id === "notes" && insights.length > 0 ? (
              <span className="ml-1 tabular-nums opacity-60">
                {insights.length}
              </span>
            ) : null}
          </button>
        ))}
      </nav>

      {contentBlockedReason ? (
        <p
          className="border-b border-[var(--warn)] bg-[var(--warn-soft)] px-4 py-2 text-sm"
          role="status"
        >
          {contentBlockedReason}
        </p>
      ) : null}

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_18.5rem]">
        <div className="min-w-0 px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
          <p className="font-mono text-[0.65rem] uppercase tracking-[0.16em] text-[var(--muted)]">
            Entry · {kindLabel(item.kind)} · {item.locationName}
          </p>
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-[var(--ink)] sm:text-3xl lg:text-[2.05rem] lg:leading-[1.15]">
            {title}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <KindBadge kind={item.kind} />
            {item.isMissing ? (
              <span className="text-xs font-semibold text-[var(--danger)]">
                Missing
              </span>
            ) : null}
          </div>

          {tab === "article" ? (
            <ArticlePane
              title={title}
              kind={item.kind}
              itemId={item.id}
              hasThumb={hasThumb}
              lens={lens}
              payload={payload}
            />
          ) : null}

          {tab === "source" ? (
            <div className="mt-6">
              <p className="lens-section-h">Source holding</p>
              {contentBlockedReason ? (
                <p className="text-sm text-[var(--muted)]">
                  Media is gated until the location is enabled and the file is
                  on disk. The article still compiles from the catalog index.
                </p>
              ) : (
                <ItemMediaViewer
                  item={item}
                  preview={preview}
                  neighbors={[
                    { id: item.id, name: item.name, kind: item.kind },
                  ]}
                  focusRoom
                  indexedBody={indexedBody ?? null}
                />
              )}
            </div>
          ) : null}

          {tab === "neighbors" ? (
            <div className="mt-6">
              <p className="lens-section-h">Neighborhood</p>
              {relatedGroups.length === 0 ? (
                <p className="text-sm text-[var(--muted)]">
                  No structural neighbors yet — same folder, shared tags, or
                  co-shelved items will appear here.
                </p>
              ) : (
                <RelatedHoldingsPanel groups={relatedGroups} bare />
              )}
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="mt-6">
              <p className="lens-section-h">Your notes</p>
              <InsightPanel itemId={item.id} initialInsights={insights} />
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 border-t border-[var(--line)] lg:border-l lg:border-t-0">
          <div className="lg:sticky lg:top-16">
            <div className="lens-infobox m-3 sm:m-4">
              <div className="lens-infobox-head">Infobox</div>
              <div className="p-2">
                <KindPoster
                  kind={item.kind}
                  title={title}
                  thumbUrl={hasThumb ? `/api/thumbs/${item.id}` : null}
                />
              </div>
              <dl>
                {facts.map((f) => (
                  <div key={f.label} className="row">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="flex flex-col gap-1.5 p-3">
                <Link href={askHref} className="btn btn-primary btn-sm">
                  Ask about this entry
                </Link>
                <Link
                  href={`${catalogHref}?room=1`}
                  className="btn btn-secondary btn-sm"
                >
                  Open reading room
                </Link>
              </div>
            </div>
          </div>
        </aside>
      </div>

      <footer className="lens-term-status">
        <span>
          cache <strong className="text-[var(--ink-soft)]">{lens.status}</strong>
        </span>
        <span>
          engine <strong className="text-[var(--ink-soft)]">{lens.mode}</strong>
        </span>
        {lens.jobId ? <span>job #{lens.jobId}</span> : null}
        <span className="ml-auto hidden sm:inline">
          keys 1–4 switch panes · compile builds the article
        </span>
      </footer>
    </article>
  );
}

function ArticlePane({
  title,
  kind,
  itemId,
  hasThumb,
  lens,
  payload,
}: {
  title: string;
  kind: string;
  itemId: number;
  hasThumb: boolean;
  lens: ReturnType<typeof useLensAnalysis>;
  payload: NonNullable<LensAnalysisRowView["payload"]> | null;
}) {
  const compiling = lens.busy || lens.status === "running";
  const [tagBusy, setTagBusy] = useState<string | null>(null);

  async function onApply(name: string) {
    setTagBusy(name);
    try {
      await lens.applyTag(name);
    } catch (err) {
      lens.setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTagBusy(null);
    }
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
          disabled={compiling}
          onClick={() => void lens.run(lens.status === "fresh")}
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {compiling
            ? "Compiling…"
            : lens.status === "fresh"
              ? "Recompile entry"
              : "Compile entry"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm inline-flex items-center gap-1.5"
          disabled={lens.busy}
          onClick={() => void lens.refresh()}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Sync
        </button>
        {lens.analysis ? (
          <button
            type="button"
            className="btn btn-ghost btn-sm inline-flex items-center gap-1.5"
            disabled={lens.busy}
            onClick={() => {
              if (
                window.confirm(
                  "Discard this compiled entry? You can compile again later.",
                )
              ) {
                void lens.discard();
              }
            }}
          >
            Discard entry
          </button>
        ) : null}
        <label className="ml-auto flex items-center gap-1.5 font-mono text-[0.68rem] text-[var(--muted)]">
          <input
            type="checkbox"
            checked={lens.auto}
            onChange={lens.toggleAuto}
            className="rounded border-[var(--line)]"
          />
          Auto-compile
        </label>
      </div>

      {lens.mode === "xai" ? (
        <p className="mt-3 font-mono text-[0.68rem] text-[var(--muted)]">
          Cloud compile uses the xAI developer API — not SuperGrok chat.
        </p>
      ) : null}

      {lens.error ? (
        <p className="mt-3 text-sm text-[var(--danger)]" role="alert">
          {lens.error}
        </p>
      ) : null}

      {lens.status === "stale" ? (
        <p className="mt-3 text-sm text-[var(--warn)]">
          Entry is outdated — the file fingerprint changed. Recompile to
          refresh.
        </p>
      ) : null}

      {lens.status === "failed" && lens.analysis?.error ? (
        <p className="mt-3 text-sm text-[var(--danger)]">
          Last compile failed: {lens.analysis.error}
        </p>
      ) : null}

      {payload ? (
        <>
          <p className="lens-lede mt-6">{payload.summary}</p>

          {payload.keyPoints.length > 0 ? (
            <>
              <h2 className="lens-section-h">Highlights</h2>
              <ol className="space-y-2.5">
                {payload.keyPoints.map((p, i) => (
                  <li key={p} className="flex gap-3 text-sm leading-relaxed">
                    <span className="font-mono text-[0.7rem] tabular-nums text-[var(--muted)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-[var(--ink-soft)]">{p}</span>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

          {payload.themes.length > 0 ? (
            <>
              <h2 className="lens-section-h">Topics</h2>
              <div className="flex flex-wrap gap-1.5">
                {payload.themes.map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
              </div>
            </>
          ) : null}

          {payload.entities.length > 0 ? (
            <>
              <h2 className="lens-section-h">Names</h2>
              <ul className="flex flex-wrap gap-1.5">
                {payload.entities.map((e) => (
                  <li key={e.name} className="chip">
                    {e.name}
                    {e.kind ? (
                      <span className="text-[var(--muted)]"> · {e.kind}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {payload.suggestedTags.length > 0 ? (
            <>
              <h2 className="lens-section-h">Suggested labels</h2>
              <ul className="flex flex-wrap gap-2">
                {payload.suggestedTags.map((t) => (
                  <li key={t}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm inline-flex items-center gap-1"
                      disabled={tagBusy === t}
                      onClick={() => void onApply(t)}
                    >
                      <Tag className="h-3 w-3" aria-hidden />
                      {tagBusy === t ? "Filing…" : t}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {payload.contentFacts.length > 0 ? (
            <>
              <h2 className="lens-section-h">Derived facts</h2>
              <dl className="grid gap-2 sm:grid-cols-2">
                {payload.contentFacts.map((f) => (
                  <div
                    key={`${f.label}:${f.value}`}
                    className="surface-inset px-3 py-2"
                  >
                    <dt className="font-mono text-[0.62rem] uppercase tracking-wide text-[var(--muted)]">
                      {f.label}
                    </dt>
                    <dd className="mt-0.5 break-all text-sm text-[var(--ink)]">
                      {f.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}

          {payload.sources.usedVision ? (
            <p className="mt-5 font-mono text-[0.68rem] uppercase tracking-wider text-[var(--ok)]">
              Vision · stills read by Grok
            </p>
          ) : null}

          {payload.caveats.length > 0 ? (
            <>
              <h2 className="lens-section-h">Apparatus</h2>
              <ul className="space-y-1 text-xs text-[var(--muted)]">
                {payload.caveats.map((c) => (
                  <li key={c}>— {c}</li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      ) : (
        <EmptyArticle
          title={title}
          kind={kind}
          compiling={compiling}
          hasThumb={hasThumb}
          itemId={itemId}
        />
      )}
    </div>
  );
}

function EmptyArticle({
  title,
  kind,
  compiling,
  hasThumb,
  itemId,
}: {
  title: string;
  kind: string;
  compiling: boolean;
  hasThumb: boolean;
  itemId: number;
}) {
  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[7rem_minmax(0,1fr)] lg:items-start">
      <div className="hidden lg:block">
        <KindPoster
          kind={kind}
          title={title}
          thumbUrl={hasThumb ? `/api/thumbs/${itemId}` : null}
        />
      </div>
      <div>
        <p className="lens-lede">
          {compiling
            ? `Compiling a first article on ${title}…`
            : `This holding has no compiled article yet. Compile the entry to
          generate an encyclopedia-style overview from indexed text and
          catalog metadata — then come back any time; the page stays until
          the file changes.`}
        </p>
        <p className="mt-4 font-mono text-xs text-[var(--muted)]">
          {kind === "image" || kind === "video"
            ? "With Grok keyed, compile looks at the picture (or sampled video stills). Local mode stays metadata/EXIF-only."
            : "Source · Neighbors · Notes are already live in the other panes."}
        </p>
      </div>
    </div>
  );
}
