"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { ArcadeScore } from "@/lib/arcade/scores";
import type { RunResult } from "@/components/arcade/night-moth/engine";

export function NightMothCabinet({
  marquee,
  children,
  wide,
  className,
}: {
  marquee: [string, string, string];
  children: ReactNode;
  wide?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("nm-cab", wide && "nm-cab--wide", className)}>
      <div className="nm-cab-marquee">
        <span>{marquee[0]}</span>
        <span>{marquee[1]}</span>
        <span>{marquee[2]}</span>
      </div>
      {children}
    </div>
  );
}

export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ArcadeCabinet({
  scores,
  highlight,
  result,
  initials,
  onInitials,
  onRelog,
  xpLine,
  actions,
  onBack,
  marquee = ["NIGHT MOTH", "HIGH SCORES", "CABINET"],
}: {
  scores: ArcadeScore[];
  highlight?: number;
  result?: RunResult;
  initials?: string;
  onInitials?: (v: string) => void;
  onRelog?: () => void;
  xpLine?: string;
  actions?: ReactNode;
  onBack?: () => void;
  marquee?: [string, string, string];
}) {
  return (
    <NightMothCabinet marquee={marquee}>
      {result ? (
        <div className="nm-cab-run">
          <p className="nm-cab-run-k">This flight</p>
          <p className="nm-cab-run-s">{result.score.toLocaleString()}</p>
          <p className="nm-cab-run-m">
            Night {result.night} · {result.nectar} nectar ·{" "}
            {formatDuration(result.durationMs)}
          </p>
          {xpLine ? <p className="nm-cab-run-x">{xpLine}</p> : null}
          {onInitials ? (
            <label className="nm-cab-ini">
              Initials
              <input
                value={initials ?? "MTH"}
                maxLength={3}
                spellCheck={false}
                onChange={(e) => onInitials(e.target.value.toUpperCase())}
              />
              {onRelog ? (
                <button type="button" className="btn btn-secondary" onClick={onRelog}>
                  Stamp
                </button>
              ) : null}
            </label>
          ) : null}
        </div>
      ) : null}
      {scores.length === 0 ? (
        <p className="nm-empty">No flights on the cabinet yet. Die gloriously.</p>
      ) : (
        <ol className="nm-cab-list">
          {scores.map((s, i) => {
            const you = highlight !== undefined && s.score === highlight;
            return (
              <li key={`${s.id}-${s.createdAt}`} className={you ? "is-you" : undefined}>
                <span className="nm-cab-rank">{String(i + 1).padStart(2, "0")}</span>
                <span className="nm-cab-tag">{s.initials || "MTH"}</span>
                <span className="nm-cab-pts">{s.score.toLocaleString()}</span>
                <span className="nm-cab-meta">
                  N{s.night} · {formatDuration(s.durationMs)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {actions || onBack ? (
        <div className="nm-actions">
          {actions}
          {onBack ? (
            <button type="button" className="btn btn-helix" onClick={onBack}>
              Back
            </button>
          ) : null}
        </div>
      ) : null}
    </NightMothCabinet>
  );
}
