"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, PictureInPicture2 } from "lucide-react";
import { DocumentReadingRoom } from "@/components/DocumentReadingRoom";
import { MediaLightbox, type LightboxItem } from "@/components/MediaLightbox";
import { useMiniPlayerOptional } from "@/components/player/MiniPlayerProvider";
import { Tooltip } from "@/components/Tooltip";
import type { MediaPreview } from "@/lib/media/preview-types";
import {
  readingRoomMode,
  supportsReadingRoom,
} from "@/lib/media/reading-room";
import type { CatalogItemRow } from "@/lib/types";

export function ItemMediaViewer({
  item,
  preview,
  neighbors,
  focusRoom = false,
  indexedBody = null,
}: {
  item: CatalogItemRow;
  preview: MediaPreview;
  neighbors: LightboxItem[];
  focusRoom?: boolean;
  indexedBody?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mini = useMiniPlayerOptional();
  const useRoom = supportsReadingRoom(item, preview);

  const miniActive =
    mini?.isActiveItem(item.id) &&
    (preview.type === "video" || preview.type === "audio");

  // Pause inline media when mini player takes over this item
  useEffect(() => {
    if (!miniActive) return;
    videoRef.current?.pause();
    audioRef.current?.pause();
  }, [miniActive, mini?.playing]);

  if (useRoom) {
    const mode = readingRoomMode(item, preview);
    const kindLabel =
      mode === "pdf"
        ? "Reading room · PDF"
        : item.kind === "code"
          ? "Reading room · code"
          : item.kind === "text"
            ? "Reading room · text"
            : "Reading room";
    return (
      <DocumentReadingRoom
        itemId={item.id}
        itemName={item.name}
        kindLabel={kindLabel}
        focusRoom={focusRoom}
        indexedBody={indexedBody}
        catalogPath={`/catalog/${item.id}`}
        mode={mode}
        sizeBytes={item.sizeBytes}
      />
    );
  }

  const canLightbox =
    preview.type === "image" ||
    preview.type === "video" ||
    preview.type === "audio";

  const canMini =
    (preview.type === "video" || preview.type === "audio") && mini != null;

  const lightboxItems =
    neighbors.length > 0
      ? neighbors
      : [{ id: item.id, name: item.name, kind: item.kind }];

  function popOutMini() {
    if (!mini || (preview.type !== "video" && preview.type !== "audio")) return;
    const el =
      preview.type === "video" ? videoRef.current : audioRef.current;
    const startAt = el && Number.isFinite(el.currentTime) ? el.currentTime : 0;
    el?.pause();
    mini.play(
      {
        itemId: item.id,
        name: item.name,
        kind: preview.type,
        mime: preview.mime,
      },
      { startAt, autoplay: true },
    );
  }

  return (
    <>
      <section className="media-theater rounded-2xl">
        <div className="media-theater-bar">
          <p className="text-xs font-medium uppercase tracking-wide text-white/45">
            Preview
            {miniActive ? (
              <span className="ml-2 normal-case tracking-normal text-white/55">
                · playing in mini player
              </span>
            ) : null}
          </p>
          <div className="flex items-center gap-2">
            {canMini ? (
              <Tooltip content="Continue in the docked mini player while you browse the catalog.">
                <button
                  type="button"
                  onClick={popOutMini}
                  className="media-theater-btn"
                >
                  <PictureInPicture2 className="h-3.5 w-3.5" aria-hidden />
                  Mini player
                </button>
              </Tooltip>
            ) : null}
            {canLightbox ? (
              <Tooltip content="Fullscreen lightbox. Arrow keys move among similar media; Esc closes.">
                <button
                  type="button"
                  onClick={() => setOpen(true)}
                  className="media-theater-btn"
                >
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden />
                  Fullscreen
                </button>
              </Tooltip>
            ) : null}
            <Tooltip content="Download the original file from disk (same bytes as the path below).">
              <a
                href={`/api/media/${item.id}?download=1`}
                className="media-theater-btn"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download
              </a>
            </Tooltip>
          </div>
        </div>

        <div
          className={`flex min-h-[12rem] items-center justify-center p-3 sm:p-4 ${
            canLightbox && preview.type === "image" ? "cursor-zoom-in" : ""
          }`}
          onClick={
            canLightbox && preview.type === "image"
              ? () => setOpen(true)
              : undefined
          }
          onKeyDown={
            canLightbox && preview.type === "image"
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") setOpen(true);
                }
              : undefined
          }
          role={canLightbox && preview.type === "image" ? "button" : undefined}
          tabIndex={canLightbox && preview.type === "image" ? 0 : undefined}
        >
          {preview.type === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview.src}
              alt={item.name}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain transition hover:brightness-110"
              title="Click for fullscreen zoom"
            />
          ) : null}

          {preview.type === "video" ? (
            miniActive ? (
              <div className="flex w-full max-w-4xl flex-col items-center gap-3 py-10 text-center">
                <p className="text-sm text-white/70">
                  Playing in the mini player at the bottom of the screen.
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    className="media-theater-btn"
                    onClick={() => mini?.toggle()}
                  >
                    {mini?.playing ? "Pause" : "Resume"}
                  </button>
                  <button
                    type="button"
                    className="media-theater-btn"
                    onClick={() => mini?.stop()}
                  >
                    Return here
                  </button>
                </div>
              </div>
            ) : (
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                poster={`/api/thumbs/${item.id}`}
                className="max-h-[70vh] w-full max-w-4xl rounded-md bg-black"
                onClick={(e) => e.stopPropagation()}
              >
                <source
                  src={preview.src}
                  type={preview.mime ?? "video/mp4"}
                />
                <a href={preview.src}>Download video</a>
              </video>
            )
          ) : null}

          {preview.type === "audio" ? (
            <div
              className="w-full max-w-xl px-2 py-8"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="mb-3 text-center text-sm text-white/70">
                {item.name}
              </p>
              {miniActive ? (
                <div className="flex flex-col items-center gap-3 text-center">
                  <p className="text-sm text-white/60">
                    Playing in the mini player.
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button
                      type="button"
                      className="media-theater-btn"
                      onClick={() => mini?.toggle()}
                    >
                      {mini?.playing ? "Pause" : "Resume"}
                    </button>
                    <button
                      type="button"
                      className="media-theater-btn"
                      onClick={() => mini?.stop()}
                    >
                      Return here
                    </button>
                  </div>
                </div>
              ) : (
                <audio
                  ref={audioRef}
                  controls
                  className="w-full"
                  src={preview.src}
                  preload="metadata"
                >
                  <a href={preview.src}>Download audio</a>
                </audio>
              )}
            </div>
          ) : null}

          {preview.type === "none" ? (
            <p className="px-4 py-10 text-center text-sm text-[var(--muted-faint)]">
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
