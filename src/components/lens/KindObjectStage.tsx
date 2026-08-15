"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { KindPoster } from "@/components/lens/KindPoster";
import {
  defaultLensObjectMode,
  type LensObjectMode,
  writeLensObjectMode,
} from "@/lib/client/lens-object-mode";
import { kindObjectSpec } from "@/lib/lens/kind-object";

const KindObjectScene = dynamic(
  () =>
    import("@/components/lens/KindObjectScene").then((m) => m.KindObjectScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex aspect-square max-h-[min(22rem,50vh)] w-full items-center justify-center rounded-xl border border-[var(--line)] bg-[#0a0f1a] text-sm text-[var(--muted)]">
        Loading object…
      </div>
    ),
  },
);

/**
 * Centerpiece: spin 3D or static poster based on preference / a11y.
 */
export function KindObjectStage({
  kind,
  title,
  itemId,
  hasThumb,
}: {
  kind: string;
  title: string;
  itemId: number;
  hasThumb: boolean;
}) {
  const [mode, setMode] = useState<LensObjectMode>("static");
  const [failed, setFailed] = useState(false);
  const [taps, setTaps] = useState(0);
  const [stamped, setStamped] = useState(false);
  const thumbUrl = hasThumb ? `/api/thumbs/${itemId}` : null;
  const spec = kindObjectSpec(kind);

  useEffect(() => {
    setMode(defaultLensObjectMode());
  }, []);

  const onFailure = useCallback(() => {
    setFailed(true);
    setMode("static");
  }, []);

  function toggle() {
    const next: LensObjectMode = mode === "spin" ? "static" : "spin";
    setMode(next);
    setFailed(false);
    writeLensObjectMode(next);
  }

  const useSpin = mode === "spin" && !failed;

  function tapObject() {
    if (stamped) return;
    const next = taps + 1;
    setTaps(next);
    if (next >= 3) setStamped(true);
  }

  return (
    <section className="space-y-2" aria-label={`${spec.label} stage`}>
      <div className="relative" onClick={tapObject}>
        {useSpin ? (
          <KindObjectScene
            kind={kind}
            title={title}
            thumbUrl={thumbUrl}
            onFailure={onFailure}
          />
        ) : (
          <KindPoster kind={kind} title={title} thumbUrl={thumbUrl} />
        )}
        {stamped ? (
          <div className="due-stamp-overlay" role="status">
            Date due
            <small>Never — keep it as long as you like</small>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted)]">{spec.description}</p>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={toggle}
        >
          {useSpin ? "Static object" : "Spin object"}
        </button>
      </div>
    </section>
  );
}
