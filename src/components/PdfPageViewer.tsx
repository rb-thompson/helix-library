"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import {
  getReadPosition,
  setReadPosition,
} from "@/lib/client/read-position";
import {
  applyPdfPageScale,
  loadPdfjs,
  type PdfDocument,
  type PdfjsClient,
} from "@/lib/media/pdfjs-client";

const SOFT_SIZE_WARN_BYTES = 50 * 1024 * 1024;

function errorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err) return err;
  if (err && typeof err === "object") {
    const o = err as { message?: unknown; name?: unknown };
    if (typeof o.message === "string" && o.message) return o.message;
    if (typeof o.name === "string" && o.name) return o.name;
  }
  try {
    return String(err ?? "Unknown PDF error");
  } catch {
    return "Unknown PDF error";
  }
}

/**
 * Single-page PDF.js viewer (page mode + text layer).
 * Client-only; parent loads via next/dynamic({ ssr: false }).
 * PDF.js comes from /public (not webpack-bundled pdfjs-dist).
 */
export function PdfPageViewer({
  itemId,
  itemName,
  sizeBytes,
  focusRoom = false,
  onFatalError,
}: {
  itemId: number;
  itemName: string;
  sizeBytes?: number | null;
  focusRoom?: boolean;
  onFatalError?: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [layoutTick, setLayoutTick] = useState(0);

  const pdfRef = useRef<PdfDocument | null>(null);
  const pdfjsRef = useRef<PdfjsClient | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderGenRef = useRef(0);
  const textLayerTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onFatalRef = useRef(onFatalError);
  onFatalRef.current = onFatalError;
  /** Avoid treating Strict Mode cleanup aborts as fatal. */
  const loadGenRef = useRef(0);

  useEffect(() => {
    const loadGen = ++loadGenRef.current;
    let cancelled = false;
    let loadingTask: {
      promise: Promise<PdfDocument>;
      destroy: () => Promise<void>;
    } | null = null;

    setLoading(true);
    setFatalError(null);
    setPageError(null);
    setNumPages(0);
    setPage(1);
    setPageInput("1");
    pdfRef.current = null;
    pdfjsRef.current = null;

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        if (cancelled || loadGen !== loadGenRef.current) return;
        pdfjsRef.current = pdfjs;

        loadingTask = pdfjs.getDocument({
          url: `/api/media/${itemId}`,
          withCredentials: false,
        });
        const pdf = await loadingTask.promise;
        if (cancelled || loadGen !== loadGenRef.current) {
          await pdf.destroy().catch(() => {});
          return;
        }
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);

        const pos = getReadPosition(itemId);
        const start =
          pos?.page != null &&
          Number.isFinite(pos.page) &&
          pos.page >= 1 &&
          pos.page <= pdf.numPages
            ? Math.floor(pos.page)
            : 1;
        setPage(start);
        setPageInput(String(start));
        setLoading(false);
      } catch (err) {
        if (cancelled || loadGen !== loadGenRef.current) return;
        const name =
          err && typeof err === "object" && "name" in err
            ? String((err as { name?: string }).name)
            : "";
        const msg = errorMessage(err);
        // Destroyed/aborted loads from React Strict Mode — ignore
        if (
          /Worker was destroyed|Loading task cancelled|Transport destroyed|AbortError/i.test(
            msg,
          )
        ) {
          return;
        }
        let message: string;
        if (name === "PasswordException" || /password/i.test(msg)) {
          message =
            "This PDF is password-protected. Download to open elsewhere.";
        } else if (name === "InvalidPDFException" || /invalid pdf/i.test(msg)) {
          message = "Invalid or corrupted PDF. Try Download.";
        } else if (
          /worker|Setting up fake worker|Failed to fetch|pdf\.min\.mjs|pdf\.worker/i.test(
            msg,
          )
        ) {
          message = `PDF engine failed (${msg}).`;
        } else if (
          !msg ||
          msg === "undefined" ||
          /undefined is not a non-null object|Cannot set propert|null is not an object|Object\.defineProperty called on non-object/i.test(
            msg,
          )
        ) {
          message = `PDF.js failed to initialize (${msg || "unknown"}).`;
        } else {
          message = msg;
        }
        setFatalError(message);
        setLoading(false);
        onFatalRef.current?.(message);
      }
    })();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void loadingTask?.destroy().catch(() => {});
      const doc = pdfRef.current;
      pdfRef.current = null;
      void doc?.destroy().catch(() => {});
    };
  }, [itemId]);

  const scheduleSavePage = useCallback(
    (pageNum: number) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        setReadPosition({
          itemId,
          page: pageNum,
          updatedAt: Date.now(),
        });
      }, 300);
    },
    [itemId],
  );

  useEffect(() => {
    if (loading || fatalError || !pdfRef.current || !pdfjsRef.current) return;
    if (page < 1 || (numPages > 0 && page > numPages)) return;

    const gen = ++renderGenRef.current;
    let cancelled = false;
    setRendering(true);
    setPageError(null);

    (async () => {
      await new Promise<void>((r) => requestAnimationFrame(() => r()));
      if (cancelled || gen !== renderGenRef.current) return;

      const pdf = pdfRef.current;
      const pdfjs = pdfjsRef.current;
      const pageEl = pageRef.current;
      const canvas = canvasRef.current;
      const textLayerDiv = textLayerRef.current;
      const container = containerRef.current;
      if (!pdf || !pdfjs || !pageEl || !canvas || !textLayerDiv || !container) {
        if (!cancelled && gen === renderGenRef.current) {
          setLayoutTick((t) => t + 1);
          setRendering(false);
        }
        return;
      }

      try {
        textLayerTaskRef.current?.cancel?.();
        textLayerTaskRef.current = null;

        const pdfPage = await pdf.getPage(page);
        if (cancelled || gen !== renderGenRef.current) return;

        // Fit page width to container — never CSS-shrink canvas alone (desyncs text layer).
        const base = pdfPage.getViewport({ scale: 1 });
        const maxW = Math.max(200, container.clientWidth - 16);
        const scale = Math.min(2.5, maxW / base.width);
        const viewport = pdfPage.getViewport({ scale });

        // PDF.js 5 text layer: positions/fonts use --scale-factor / --total-scale-factor
        applyPdfPageScale(pageEl, viewport);
        if (typeof pdfjs.setLayerDimensions === "function") {
          // Keep rotation/data attrs consistent with stock viewer
          pdfjs.setLayerDimensions(pageEl, viewport);
          // setLayerDimensions may set calc() width — re-assert pixel box for canvas % fill
          applyPdfPageScale(pageEl, viewport);
        }

        const outputScale = Math.min(window.devicePixelRatio || 1, 2);
        const cssW = Math.floor(viewport.width);
        const cssH = Math.floor(viewport.height);

        canvas.width = Math.floor(cssW * outputScale);
        canvas.height = Math.floor(cssH * outputScale);
        // Fill the scaled page box 1:1 (no max-width shrink)
        canvas.style.width = "100%";
        canvas.style.height = "100%";

        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) throw new Error("Canvas 2D unavailable");

        const transform =
          outputScale !== 1
            ? ([outputScale, 0, 0, outputScale, 0, 0] as number[])
            : undefined;

        const renderTask = pdfPage.render({
          canvas,
          canvasContext: ctx,
          viewport,
          transform,
        });
        await renderTask.promise;
        if (cancelled || gen !== renderGenRef.current) return;

        // Rebuild text layer; let TextLayer.setLayerDimensions size the container
        textLayerDiv.replaceChildren();
        textLayerDiv.removeAttribute("style");
        textLayerDiv.className = "textLayer";
        // Inherit scale vars from page (already set); clear any stale inline size
        textLayerDiv.style.setProperty("--scale-factor", String(scale));
        textLayerDiv.style.setProperty("--total-scale-factor", String(scale));

        const textContent = await pdfPage.getTextContent();
        if (cancelled || gen !== renderGenRef.current) return;

        const textLayer = new pdfjs.TextLayer({
          textContentSource: textContent,
          container: textLayerDiv,
          viewport,
        });
        textLayerTaskRef.current = textLayer;
        await textLayer.render();
        if (cancelled || gen !== renderGenRef.current) return;

        // After layout, force text layer box to match page exactly (subpixel safety)
        textLayerDiv.style.left = "0";
        textLayerDiv.style.top = "0";
        textLayerDiv.style.right = "auto";
        textLayerDiv.style.bottom = "auto";
        textLayerDiv.style.width = "100%";
        textLayerDiv.style.height = "100%";

        scheduleSavePage(page);
        setPageInput(String(page));
      } catch (err) {
        if (cancelled || gen !== renderGenRef.current) return;
        setPageError(errorMessage(err) || "Failed to render page.");
      } finally {
        if (!cancelled && gen === renderGenRef.current) {
          setRendering(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      textLayerTaskRef.current?.cancel?.();
      textLayerTaskRef.current = null;
    };
  }, [loading, fatalError, page, numPages, layoutTick, scheduleSavePage]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let lastW = el.clientWidth;
    const ro = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (Math.abs(w - lastW) < 12) return;
      lastW = w;
      setLayoutTick((t) => t + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loading, fatalError]);

  const goTo = useCallback(
    (next: number) => {
      if (numPages <= 0) return;
      const clamped = Math.min(numPages, Math.max(1, Math.floor(next)));
      setPageError(null);
      setPage(clamped);
      setPageInput(String(clamped));
    },
    [numPages],
  );

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goTo(page - 1);
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goTo(page + 1);
      } else if (e.key === "Home") {
        e.preventDefault();
        goTo(1);
      } else if (e.key === "End") {
        e.preventDefault();
        goTo(numPages);
      }
    },
    [goTo, page, numPages],
  );

  const heightClass = focusRoom
    ? "max-h-[min(92vh,56rem)] min-h-[min(70vh,32rem)]"
    : "max-h-[min(80vh,42rem)] min-h-[16rem]";

  const softWarn =
    sizeBytes != null && sizeBytes > SOFT_SIZE_WARN_BYTES
      ? `Large file (${formatBytes(sizeBytes)}). Rendering page-by-page.`
      : null;

  if (loading) {
    return (
      <div
        className={`flex ${heightClass} flex-col items-center justify-center gap-2 p-6 text-sm text-white/50`}
      >
        <HelixSpinner size="lg" decorative />
        Opening PDF…
      </div>
    );
  }

  if (fatalError) {
    return (
      <div
        className={`flex ${heightClass} flex-col items-center justify-center gap-3 px-4 text-center`}
      >
        <p className="text-sm text-[var(--danger)]">{fatalError}</p>
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
    <div
      className={`flex ${heightClass} flex-col outline-none`}
      tabIndex={0}
      onKeyDown={onKeyDown}
      role="region"
      aria-label={`PDF page ${page} of ${numPages}: ${itemName}`}
    >
      <div className="mb-2 flex flex-wrap items-center justify-center gap-2 px-1">
        <button
          type="button"
          className="media-theater-btn disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => goTo(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Prev
        </button>
        <form
          className="flex items-center gap-1.5 text-xs text-white/70"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Number(pageInput);
            if (Number.isFinite(n)) goTo(n);
            else setPageInput(String(page));
          }}
        >
          <label className="sr-only" htmlFor={`pdf-page-${itemId}`}>
            Page number
          </label>
          <input
            id={`pdf-page-${itemId}`}
            type="number"
            min={1}
            max={numPages || 1}
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onBlur={() => {
              const n = Number(pageInput);
              if (Number.isFinite(n)) goTo(n);
              else setPageInput(String(page));
            }}
            className="w-14 rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-center text-white"
          />
          <span className="text-white/45">/ {numPages || "—"}</span>
        </form>
        <button
          type="button"
          className="media-theater-btn disabled:opacity-40"
          disabled={page >= numPages}
          onClick={() => goTo(page + 1)}
          aria-label="Next page"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
        {rendering ? (
          <span className="inline-flex items-center gap-1 text-[0.65rem] text-white/40">
            <HelixSpinner size="sm" decorative />
            Render
          </span>
        ) : null}
      </div>

      {softWarn ? (
        <p className="mb-2 text-center text-[0.7rem] text-amber-200/70">
          {softWarn}
        </p>
      ) : null}

      {pageError ? (
        <p className="mb-2 text-center text-xs text-[var(--danger)]">
          {pageError}
        </p>
      ) : null}

      <div
        ref={containerRef}
        className="flex min-h-0 flex-1 justify-center overflow-auto rounded-md bg-black/30 p-2"
      >
        <div ref={pageRef} className="pdf-page shadow-lg">
          <canvas ref={canvasRef} className="pdf-page__canvas" />
          <div ref={textLayerRef} className="textLayer" />
        </div>
      </div>

      <p className="mt-2 text-center text-[0.7rem] text-white/35">
        ← → change page · select text for Copy / Tag / Ask
      </p>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
