"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, RefreshCw, Trash2 } from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { cn } from "@/lib/cn";

/**
 * Catalog video poster control: grab a frame at a timestamp or upload an image.
 * Writes data/thumbs/{id}.webp (same path the grid uses).
 */
export function VideoThumbEditor({
  itemId,
  durationMs,
  hasThumb: initialHasThumb,
}: {
  itemId: number;
  durationMs: number | null;
  hasThumb: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasThumb, setHasThumb] = useState(initialHasThumb);
  const [seek, setSeek] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bust, setBust] = useState(0);

  const durationSec =
    durationMs != null && durationMs > 0 ? durationMs / 1000 : null;
  const maxSeek = durationSec != null ? Math.max(0, durationSec - 0.25) : 3600;

  async function run(
    work: () => Promise<Response>,
    okMsg: string,
  ) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await work();
      const data = await res.json();
      if (!res.ok || data.ok === false) {
        setError(data.error ?? "Could not update thumbnail");
        return;
      }
      setHasThumb(true);
      setBust(Date.now());
      setMessage(okMsg);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }

  function grabFrame(seconds: number) {
    void run(
      () =>
        fetch(`/api/items/${itemId}/thumb`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seekSeconds: seconds }),
        }),
      `Poster set from ${seconds.toFixed(1)}s`,
    );
  }

  function onFile(file: File | null) {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    void run(
      () =>
        fetch(`/api/items/${itemId}/thumb`, {
          method: "POST",
          body: fd,
        }),
      "Custom image applied as catalog thumb",
    );
  }

  const presets: Array<{ label: string; sec: number }> = [
    { label: "0s", sec: 0 },
    { label: "1s", sec: 1 },
    { label: "5s", sec: 5 },
    { label: "15s", sec: 15 },
    { label: "30s", sec: 30 },
  ];
  if (durationSec != null && durationSec > 2) {
    presets.push(
      { label: "25%", sec: durationSec * 0.25 },
      { label: "Mid", sec: durationSec * 0.5 },
      { label: "75%", sec: durationSec * 0.75 },
    );
  }

  return (
    <section className="surface p-4 sm:p-5">
      <h2 className="text-sm font-semibold tracking-tight text-[var(--ink)]">
        Catalog thumbnail
      </h2>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Grid cards and posters use this image. Grab a frame from the video or
        upload a still.
      </p>

      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative h-28 w-44 shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)]">
          {hasThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={bust}
              src={`/api/thumbs/${itemId}?v=${bust || "1"}`}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-2 text-center text-[0.7rem] text-[var(--muted)]">
              No thumb yet
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div>
            <p className="label-quiet">Frame from video</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  disabled={busy || p.sec > maxSeek + 0.01}
                  className="btn btn-secondary btn-sm"
                  onClick={() => grabFrame(Math.min(p.sec, maxSeek))}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-[6rem]">
                <span className="label-quiet">Seconds</span>
                <input
                  type="number"
                  min={0}
                  max={maxSeek}
                  step={0.5}
                  value={seek}
                  onChange={(e) => setSeek(Number(e.target.value))}
                  disabled={busy}
                  className="field !py-1.5 sm:max-w-[7rem]"
                />
              </label>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy || seek < 0 || seek > maxSeek}
                onClick={() => grabFrame(seek)}
              >
                {busy ? (
                  <HelixSpinner size="sm" decorative />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Grab frame
              </button>
            </div>
            {durationSec != null ? (
              <p className="mt-1 text-[0.65rem] text-[var(--muted-faint)]">
                Duration {durationSec.toFixed(1)}s · max seek {maxSeek.toFixed(1)}s
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                onFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5" />
              Upload image
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy || !hasThumb}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError(null);
                  setMessage(null);
                  try {
                    const res = await fetch(`/api/items/${itemId}/thumb`, {
                      method: "DELETE",
                    });
                    const data = await res.json();
                    if (!res.ok || data.ok === false) {
                      setError(data.error ?? "Could not clear thumbnail");
                      return;
                    }
                    setHasThumb(false);
                    setBust(Date.now());
                    setMessage("Thumbnail cleared");
                    router.refresh();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Request failed");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <p className={cn("feedback-ok mt-3")} role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="feedback-err mt-3" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
