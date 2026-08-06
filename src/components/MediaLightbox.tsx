"use client";

import { useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  X,
} from "lucide-react";

export type LightboxItem = {
  id: number;
  name: string;
  kind: string;
};

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
  const startIndex = Math.max(
    0,
    items.findIndex((i) => i.id === startId),
  );
  const [index, setIndex] = useState(startIndex);

  useEffect(() => {
    if (open) setIndex(startIndex);
  }, [open, startIndex, startId]);

  const current = items[index] ?? null;
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);
  const goNext = useCallback(() => {
    setIndex((i) => Math.min(items.length - 1, i + 1));
  }, [items.length]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose, goPrev, goNext]);

  if (!open || !current) return null;

  const mediaSrc = `/api/media/${current.id}`;
  const isImage = current.kind === "image";
  const isVideo = current.kind === "video";
  const isAudio = current.kind === "audio";

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
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
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

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2 sm:p-4">
        {hasPrev ? (
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
              className="max-h-[calc(100dvh-7rem)] max-w-full object-contain"
            />
          ) : null}
          {isVideo ? (
            <video
              key={current.id}
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
              <audio key={current.id} controls autoPlay className="w-full" src={mediaSrc} />
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

        {hasNext ? (
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
    </div>
  );
}
