"use client";

import { useState } from "react";
import { Download, Maximize2 } from "lucide-react";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import { Tooltip } from "@/components/Tooltip";
import type { MediaPreview } from "@/lib/media/preview";
import type { CatalogItemRow } from "@/lib/types";

export function ItemMediaViewer({
  item,
  preview,
  neighbors,
}: {
  item: CatalogItemRow;
  preview: MediaPreview;
  neighbors: LightboxItem[];
}) {
  const [open, setOpen] = useState(false);
  const canLightbox =
    preview.type === "image" ||
    preview.type === "video" ||
    preview.type === "audio";

  const lightboxItems =
    neighbors.length > 0
      ? neighbors
      : [{ id: item.id, name: item.name, kind: item.kind }];

  return (
    <>
      <section className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-stone-400">
            Preview
          </p>
          <div className="flex items-center gap-2">
            {canLightbox ? (
              <Tooltip content="Fullscreen lightbox. Arrow keys move among similar media; Esc closes.">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/15"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  Fullscreen
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content="Download the original file from disk (same bytes as the path below).">
              <a
                href={`/api/media/${item.id}?download=1`}
                className="inline-flex items-center gap-1.5 rounded-md bg-white/10 px-2.5 py-1 text-xs font-medium text-white hover:bg-white/15"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </a>
            </Tooltip>
          </div>
        </div>

        <div
          className={`flex min-h-[12rem] items-center justify-center p-3 sm:p-4 ${
            canLightbox ? "cursor-zoom-in" : ""
          }`}
          onClick={canLightbox ? () => setOpen(true) : undefined}
          onKeyDown={
            canLightbox
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") setOpen(true);
                }
              : undefined
          }
          role={canLightbox ? "button" : undefined}
          tabIndex={canLightbox ? 0 : undefined}
        >
          {preview.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.src}
              alt={item.name}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
            />
          ) : null}

          {preview.type === "video" ? (
            <video
              controls
              playsInline
              preload="metadata"
              poster={
                // may 404 if no poster — browser ignores
                `/api/thumbs/${item.id}`
              }
              className="max-h-[70vh] w-full max-w-4xl rounded-md bg-black"
              src={preview.src}
              onClick={(e) => e.stopPropagation()}
            >
              <a href={preview.src}>Download video</a>
            </video>
          ) : null}

          {preview.type === "audio" ? (
            <div
              className="w-full max-w-xl px-2 py-8"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-center text-sm text-stone-300">
                {item.name}
              </p>
              <audio
                controls
                className="w-full"
                src={preview.src}
                preload="metadata"
              >
                <a href={preview.src}>Download audio</a>
              </audio>
            </div>
          ) : null}

          {preview.type === "pdf" ? (
            <iframe
              title={item.name}
              src={preview.src}
              className="h-[70vh] w-full rounded-md bg-white"
              onClick={(e) => e.stopPropagation()}
            />
          ) : null}

          {preview.type === "text" ? (
            <div className="w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
              <pre className="max-h-[70vh] overflow-auto rounded-md bg-stone-900 p-4 text-left text-xs leading-relaxed text-stone-100">
                {preview.text}
              </pre>
              {preview.truncated ? (
                <p className="mt-2 text-center text-xs text-stone-500">
                  Preview truncated to first 64 KB.
                </p>
              ) : null}
            </div>
          ) : null}

          {preview.type === "none" ? (
            <p className="px-4 py-10 text-center text-sm text-stone-400">
              {preview.reason}
            </p>
          ) : null}
        </div>
      </section>

      <MediaLightbox
        items={lightboxItems}
        startId={item.id}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
