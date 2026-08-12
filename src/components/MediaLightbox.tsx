"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  PictureInPicture2,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMiniPlayerOptional } from "@/components/player/MiniPlayerProvider";

export type LightboxItem = {
  id: number;
  name: string;
  kind: string;
};

const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const ZOOM_STEP = 0.35;

export function MediaLightbox({
  items,
  startId,
  open,
  onClose,
}: {
  items: LightboxItem[];
  startId: number;
  open: boolean;
  onClose: () => void;
}) {
  const titleId = useId();
  const mini = useMiniPlayerOptional();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startIndex = Math.max(
    0,
    items.findIndex((i) => i.id === startId),
  );
  const [index, setIndex] = useState(startIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex, startId]);

  // Reset zoom when navigating items or closing
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    dragRef.current = null;
  }, [index, open, startId]);

  const current = items[index] ?? null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  const clampZoom = useCallback((z: number) => {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  }, []);

  const zoomBy = useCallback(
    (delta: number) => {
      setZoom((z) => {
        const next = clampZoom(z + delta);
        if (next <= ZOOM_MIN) setPan({ x: 0, y: 0 });
        return next;
      });
    },
    [clampZoom],
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (zoom > 1) {
          e.preventDefault();
          resetZoom();
          return;
        }
        onClose();
      }
      if (e.key === "ArrowLeft" && zoom <= 1) goPrev();
      if (e.key === "ArrowRight" && zoom <= 1) goNext();
      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        zoomBy(ZOOM_STEP);
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        zoomBy(-ZOOM_STEP);
      }
      if (e.key === "0") {
        e.preventDefault();
        resetZoom();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, goPrev, goNext, zoom, zoomBy, resetZoom]);

  if (!open || !current) return null;

  const mediaSrc = `/api/media/${current.id}`;
  const isImage = current.kind === "image";
  const isVideo = current.kind === "video";
  const isAudio = current.kind === "audio";
  const zoomed = zoom > 1.01;
  const canMini = (isVideo || isAudio) && mini != null;

  function popOutMini() {
    if (!mini || (!isVideo && !isAudio)) return;
    const el = isVideo ? videoRef.current : audioRef.current;
    const startAt = el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
    el?.pause();
    mini.play(
      {
        itemId: current.id,
        name: current.name,
        kind: isVideo ? "video" : "audio",
      },
      { startAt, autoplay: true },
    );
    onClose();
  }

  function onWheel(e: ReactWheelEvent) {
    if (!isImage) return;
    e.preventDefault();
    const dir = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomBy(dir);
  }

  function onPointerDown(e: ReactPointerEvent) {
    if (!isImage || zoom <= 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: pan.x,
      originY: pan.y,
    };
  }

  function onPointerMove(e: ReactPointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPan({
      x: d.originX + (e.clientX - d.startX),
      y: d.originY + (e.clientY - d.startY),
    });
  }

  function onPointerUp(e: ReactPointerEvent) {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
    }
  }

  function onImageDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (zoom > 1) resetZoom();
    else setZoom(clampZoom(2.5));
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="fixed inset-0 z-[100] flex flex-col bg-black/95 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-2 py-2 sm:gap-3 sm:px-4 sm:py-3">
        <div className="min-w-0">
          <p id={titleId} className="truncate text-sm font-medium text-white">
            {current.name}
          </p>
          <p className="text-xs text-white/45">
            {index + 1} / {items.length} · {current.kind}
            {isImage && zoomed ? ` · ${Math.round(zoom * 100)}%` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {isImage ? (
            <>
              <button
                type="button"
                onClick={() => zoomBy(-ZOOM_STEP)}
                className="media-theater-btn !p-2"
                aria-label="Zoom out"
                title="Zoom out (−)"
                disabled={zoom <= ZOOM_MIN}
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => zoomBy(ZOOM_STEP)}
                className="media-theater-btn !p-2"
                aria-label="Zoom in"
                title="Zoom in (+)"
                disabled={zoom >= ZOOM_MAX}
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={resetZoom}
                className="media-theater-btn !p-2"
                aria-label="Reset zoom"
                title="Reset zoom (0)"
                disabled={!zoomed}
              >
                <RotateCcw className="h-4 w-4" />
              </button>
            </>
          ) : null}
          {canMini ? (
            <button
              type="button"
              onClick={popOutMini}
              title="Continue in mini player while browsing"
              className="media-theater-btn sm:gap-1.5 sm:px-2.5 sm:py-1.5"
            >
              <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Mini player</span>
            </button>
          ) : null}
          <Link
            href={`/catalog/${current.id}`}
            title="Open full item page with metadata, EXIF, and curation"
            className="media-theater-btn sm:gap-1.5 sm:px-2.5 sm:py-1.5"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Detail</span>
          </Link>
          <a
            href={`${mediaSrc}?download=1`}
            title="Download original file"
            className="media-theater-btn sm:gap-1.5 sm:px-2.5 sm:py-1.5"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            type="button"
            onClick={onClose}
            className="media-theater-btn !p-2"
            aria-label="Close"
            title="Close (Esc)"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2 sm:p-4 ${
          isImage && zoomed ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onWheel={isImage ? onWheel : undefined}
      >
        {hasPrev && !zoomed ? (
          <button
            type="button"
            onClick={goPrev}
            className="absolute left-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:left-4 sm:bg-white/10 sm:hover:bg-white/20"
            aria-label="Previous"
            title="Previous (←)"
          >
            <ChevronLeft className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
        ) : null}

        <div className="flex max-h-full max-w-full items-center justify-center">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={current.id}
              src={mediaSrc}
              alt={current.name}
              draggable={false}
              onDoubleClick={onImageDoubleClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={`max-h-[calc(100dvh-7rem)] max-w-full select-none object-contain transition-transform duration-100 ease-out ${
                zoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
              }`}
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
              }}
              title={
                zoomed
                  ? "Drag to pan · double-click or 0 to reset · scroll to zoom"
                  : "Scroll or + to zoom · double-click to zoom in"
              }
            />
          ) : null}
          {isVideo ? (
            <video
              key={current.id}
              ref={videoRef}
              controls
              autoPlay
              playsInline
              className="max-h-[calc(100dvh-7rem)] max-w-full bg-black"
            >
              <source src={mediaSrc} type="video/mp4" />
            </video>
          ) : null}
          {isAudio ? (
            <div className="w-full max-w-lg px-4">
              <p className="mb-4 text-center text-sm text-white/70">
                {current.name}
              </p>
              <audio
                key={current.id}
                ref={audioRef}
                controls
                autoPlay
                className="w-full"
                src={mediaSrc}
              />
            </div>
          ) : null}
          {!isImage && !isVideo && !isAudio ? (
            <div className="text-center text-sm text-white/70">
              <p>No fullscreen preview for this type.</p>
              <Link
                href={`/catalog/${current.id}`}
                className="mt-3 inline-block text-white/70 underline-offset-2 hover:text-white hover:underline"
              >
                Open detail page
              </Link>
            </div>
          ) : null}
        </div>

        {hasNext && !zoomed ? (
          <button
            type="button"
            onClick={goNext}
            className="absolute right-1 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/15 p-2 text-white hover:bg-white/25 sm:right-4 sm:bg-white/10 sm:hover:bg-white/20"
            aria-label="Next"
            title="Next (→)"
          >
            <ChevronRight className="h-6 w-6 sm:h-7 sm:w-7" />
          </button>
        ) : null}
      </div>

      {isImage ? (
        <p className="shrink-0 border-t border-white/10 px-3 py-1.5 text-center text-[0.65rem] text-white/40">
          Scroll / + − to zoom · drag to pan · double-click or 0 to reset · Esc
          closes{zoomed ? " (resets zoom first)" : ""}
        </p>
      ) : null}
    </div>
  );
}
