"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";
import {
  BookOpen,
  Download,
  Maximize2,
  Minimize2,
  MessageSquareText,
} from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import {
  getReadPosition,
  setReadPosition,
} from "@/lib/client/read-position";
import { buildAskHoldingHref } from "@/lib/client/ask-quote";
import { SelectionToolbar } from "@/components/SelectionToolbar";
import { Tooltip } from "@/components/Tooltip";

/**
 * PDF.js must never load during SSR (pdf.mjs throws
 * "Object.defineProperty called on non-object" under webpack SSR).
 */
const PdfPageViewer = dynamic(
  () =>
    import("@/components/PdfPageViewer").then((m) => m.PdfPageViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-[16rem] items-center justify-center gap-2 text-sm text-white/50">
        <HelixSpinner size="md" decorative />
        Loading PDF reader…
      </div>
    ),
  },
);

type TextPayload = {
  text: string;
  truncated: boolean;
  byteLength: number;
  encoding: "utf-8";
};

type SourceMode = "file" | "indexed";

export type ReadingRoomMode = "text" | "pdf";

/**
 * Document reading room: text/code continuous (PR1a) + PDF.js page mode (PR1b).
 * PDF failures fall back to iframe of gated /api/media/{id}.
 */
export function DocumentReadingRoom({
  itemId,
  itemName,
  kindLabel = "Reading room",
  focusRoom = false,
  indexedBody = null,
  catalogPath,
  mode = "text",
  sizeBytes = null,
}: {
  itemId: number;
  itemName: string;
  kindLabel?: string;
  /** Expand layout via ?room=1 */
  focusRoom?: boolean;
  /** Indexed FTS sample for optional compare toggle (text mode) */
  indexedBody?: string | null;
  /** Base path for focus toggle links, e.g. /catalog/12 */
  catalogPath: string;
  mode?: ReadingRoomMode;
  sizeBytes?: number | null;
}) {
  const [pdfFallback, setPdfFallback] = useState(false);
  const [pdfFailMsg, setPdfFailMsg] = useState<string | null>(null);
  const roomSurfaceRef = useRef<HTMLDivElement | null>(null);

  // Reset fallback when switching holdings / mode
  useEffect(() => {
    setPdfFallback(false);
    setPdfFailMsg(null);
  }, [itemId, mode]);

  const heightClass = focusRoom
    ? "max-h-[min(92vh,56rem)] min-h-[70vh]"
    : "max-h-[min(80vh,42rem)] min-h-[16rem]";

  const focusHref = focusRoom
    ? catalogPath
    : `${catalogPath}${catalogPath.includes("?") ? "&" : "?"}room=1`;

  return (
    <section
      className={`media-theater rounded-2xl ${focusRoom ? "ring-1 ring-[var(--lamp)]/45" : ""}`}
      aria-label="Reading room"
    >
      <div className="media-theater-bar">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/45">
          <BookOpen className="h-3.5 w-3.5 text-white/50" aria-hidden />
          {kindLabel}
          {mode === "pdf" && pdfFallback ? (
            <span className="normal-case tracking-normal text-white/30">
              · browser PDF
            </span>
          ) : null}
        </p>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {mode === "pdf" && pdfFallback ? (
            <button
              type="button"
              className="media-theater-btn"
              onClick={() => {
                setPdfFailMsg(null);
                setPdfFallback(false);
              }}
            >
              Retry PDF.js
            </button>
          ) : null}
          <Tooltip
            content={
              focusRoom
                ? "Exit focus room and show full holding layout."
                : "Focus room: taller reader, less chrome on small screens."
            }
          >
            <Link href={focusHref} className="media-theater-btn" scroll={false}>
              {focusRoom ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden />
                  Exit focus
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  Focus room
                </>
              )}
            </Link>
          </Tooltip>
          <Tooltip content="Ask the Librarian about this holding (catalog_read context).">
            <Link
              href={buildAskHoldingHref(itemId)}
              className="media-theater-btn"
            >
              <MessageSquareText className="h-3.5 w-3.5" aria-hidden />
              Ask
            </Link>
          </Tooltip>
          <Tooltip content="Download the original file from disk.">
            <a
              href={`/api/media/${itemId}?download=1`}
              className="media-theater-btn"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              Download
            </a>
          </Tooltip>
        </div>
      </div>

      <div
        ref={roomSurfaceRef}
        className={
          mode === "pdf"
            ? "relative p-3 sm:p-4"
            : `relative flex flex-col p-3 sm:p-4 ${heightClass}`
        }
      >
        {mode === "pdf" ? (
          pdfFallback ? (
            <div className={`flex ${heightClass} flex-col gap-2`}>
              {pdfFailMsg ? (
                <p className="text-center text-xs text-amber-200/80">
                  {pdfFailMsg} Showing browser PDF fallback.
                </p>
              ) : null}
              <iframe
                title={itemName}
                src={`/api/media/${itemId}`}
                className="min-h-0 w-full flex-1 rounded-md bg-[var(--surface)]"
              />
            </div>
          ) : (
            <PdfPageViewer
              itemId={itemId}
              itemName={itemName}
              sizeBytes={sizeBytes}
              focusRoom={focusRoom}
              onFatalError={(message) => {
                setPdfFailMsg(message);
                setPdfFallback(true);
              }}
            />
          )
        ) : (
          <TextReadingPane
            itemId={itemId}
            itemName={itemName}
            indexedBody={indexedBody}
          />
        )}
        {/* Selection → Tag / Ask / Copy (PR2). PDF iframe fallback has no selection. */}
        {!pdfFallback ? (
          <SelectionToolbar itemId={itemId} containerRef={roomSurfaceRef} />
        ) : null}
      </div>
    </section>
  );
}

function TextReadingPane({
  itemId,
  itemName,
  indexedBody,
}: {
  itemId: number;
  itemName: string;
  indexedBody?: string | null;
}) {
  const [fileText, setFileText] = useState<TextPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<SourceMode>("file");
  const scrollerRef = useRef<HTMLPreElement | null>(null);
  const restoredRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    restoredRef.current = false;
    setLoading(true);
    setError(null);
    setFileText(null);
    setSource("file");

    (async () => {
      try {
        const res = await fetch(`/api/items/${itemId}/text`);
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          if (!cancelled) {
            setError(body?.error ?? `Could not load text (${res.status})`);
            setLoading(false);
          }
          return;
        }
        const data = (await res.json()) as TextPayload;
        if (!cancelled) {
          setFileText(data);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setError("Network error loading text.");
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [itemId]);

  const activeText =
    source === "indexed" && indexedBody != null
      ? indexedBody
      : (fileText?.text ?? "");

  const scheduleSave = useCallback(
    (scrollRatio: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setReadPosition({
          itemId,
          scrollRatio: Math.min(1, Math.max(0, scrollRatio)),
          updatedAt: Date.now(),
        });
      }, 400);
    },
    [itemId],
  );

  const onScroll = useCallback(
    (e: UIEvent<HTMLPreElement>) => {
      const el = e.currentTarget;
      const max = el.scrollHeight - el.clientHeight;
      const ratio = max <= 0 ? 0 : el.scrollTop / max;
      scheduleSave(ratio);
    },
    [scheduleSave],
  );

  useEffect(() => {
    if (loading || error || restoredRef.current) return;
    if (source !== "file") return;
    const el = scrollerRef.current;
    if (!el || !activeText) return;

    const pos = getReadPosition(itemId);
    const ratio = pos?.scrollRatio;
    if (ratio == null || ratio <= 0) {
      restoredRef.current = true;
      return;
    }

    const id = requestAnimationFrame(() => {
      const max = el.scrollHeight - el.clientHeight;
      if (max > 0) {
        el.scrollTop = ratio * max;
      }
      restoredRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [loading, error, activeText, itemId, source]);

  const canToggleIndexed =
    indexedBody != null &&
    indexedBody.trim().length > 0 &&
    fileText != null &&
    indexedBody.trim() !== fileText.text.trim();

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-sm text-white/50">
        <HelixSpinner size="md" decorative />
        Loading text…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-sm text-[var(--danger)]">{error}</p>
        <a
          href={`/api/media/${itemId}?download=1`}
          className="media-theater-btn"
        >
          <Download className="h-3.5 w-3.5" aria-hidden />
          Download original
        </a>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {canToggleIndexed ? (
        <div className="mb-2 flex justify-end">
          <div className="flex rounded-md bg-white/5 p-0.5 text-[0.65rem]">
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${
                source === "file"
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
              onClick={() => {
                restoredRef.current = true;
                setSource("file");
              }}
            >
              Full file
            </button>
            <button
              type="button"
              className={`rounded px-2 py-0.5 ${
                source === "indexed"
                  ? "bg-white/15 text-white"
                  : "text-white/50 hover:text-white/80"
              }`}
              onClick={() => {
                restoredRef.current = true;
                setSource("indexed");
              }}
            >
              Indexed sample
            </button>
          </div>
        </div>
      ) : null}
      <pre
        ref={scrollerRef}
        onScroll={onScroll}
        className="reading-room-text min-h-0 flex-1 overflow-auto rounded-md bg-black/40 p-4 text-left font-mono text-sm leading-relaxed whitespace-pre-wrap break-words text-white/90 sm:text-[0.9375rem]"
        tabIndex={0}
      >
        {activeText || <span className="text-white/40">(empty file)</span>}
      </pre>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[0.7rem] text-white/40">
        <span>
          {source === "indexed"
            ? "Indexed FTS sample (reindex-time)."
            : fileText?.truncated
              ? `Showing first ${fileText.text.length.toLocaleString()} characters (file ${formatBytes(fileText.byteLength)}; capped at 512 KiB).`
              : fileText
                ? `${formatBytes(fileText.byteLength)} · UTF-8`
                : null}
        </span>
        <span className="font-mono text-white/30">{itemName}</span>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
