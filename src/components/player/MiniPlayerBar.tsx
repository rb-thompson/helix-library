"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import type { MiniTrack } from "@/components/player/MiniPlayerProvider";

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60) % 60;
  const h = Math.floor(sec / 3600);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MiniPlayerBar({
  track,
  playing,
  currentTime,
  duration,
  expanded,
  onToggle,
  onSeek,
  onSkip,
  onStop,
  onExpand,
}: {
  track: MiniTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSkip: (d: number) => void;
  onStop: () => void;
  onExpand: () => void;
}) {
  if (!track) return null;

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const isVideo = track.kind === "video";

  return (
    <>
      {isVideo && expanded ? (
        <div
          className="mini-player-pip"
          role="complementary"
          aria-label="Expanded video"
        >
          <div className="mini-player-pip-chrome">
            <span className="mini-player-pip-label truncate" title={track.name}>
              {track.name}
            </span>
            <button
              type="button"
              className="mini-player-icon-btn"
              onClick={onExpand}
              title="Dock video"
              aria-label="Dock video"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {/* video element is positioned into .mini-player-pip-stage via CSS */}
          <div className="mini-player-pip-stage" />
        </div>
      ) : null}

      <div
        className="mini-player-bar"
        role="region"
        aria-label="Now playing"
        data-kind={track.kind}
      >
        <div className="mini-player-bar-inner">
          <div
            className="mini-player-art"
            onClick={isVideo ? onExpand : undefined}
            onKeyDown={
              isVideo
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onExpand();
                    }
                  }
                : undefined
            }
            role={isVideo ? "button" : undefined}
            tabIndex={isVideo ? 0 : undefined}
            title={isVideo ? (expanded ? "Dock video" : "Expand video") : undefined}
          >
            {/* CSS places the shared <video> here when not expanded */}
            <div className="mini-player-art-stage" />
            {!isVideo ? (
              <span className="mini-player-art-note" aria-hidden>
                ♪
              </span>
            ) : null}
          </div>

          <div className="mini-player-meta min-w-0">
            <Link
              href={`/catalog/${track.itemId}`}
              className="mini-player-title"
              title={track.name}
            >
              {track.name}
            </Link>
            <p className="mini-player-sub">
              {isVideo ? "Video" : "Audio"} · now playing
            </p>
          </div>

          <div className="mini-player-transport">
            <button
              type="button"
              className="mini-player-icon-btn"
              onClick={() => onSkip(-10)}
              title="Back 10s"
              aria-label="Back 10 seconds"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="mini-player-play-btn"
              onClick={onToggle}
              title={playing ? "Pause" : "Play"}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-5 w-5" fill="currentColor" />
              ) : (
                <Play className="h-5 w-5" fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className="mini-player-icon-btn"
              onClick={() => onSkip(10)}
              title="Forward 10s"
              aria-label="Forward 10 seconds"
            >
              <SkipForward className="h-4 w-4" />
            </button>
          </div>

          <div className="mini-player-scrub">
            <span className="mini-player-time tabular-nums">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              className="mini-player-range"
              min={0}
              max={duration > 0 ? duration : 1}
              step={0.1}
              value={Math.min(currentTime, duration || 0)}
              disabled={!(duration > 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Seek"
              style={
                {
                  "--progress": `${progress}%`,
                } as CSSProperties
              }
            />
            <span className="mini-player-time tabular-nums">
              {formatTime(duration)}
            </span>
          </div>

          <div className="mini-player-end">
            {isVideo ? (
              <button
                type="button"
                className="mini-player-icon-btn"
                onClick={onExpand}
                title={expanded ? "Dock video" : "Expand video"}
                aria-label={expanded ? "Dock video" : "Expand video"}
              >
                {expanded ? (
                  <Minimize2 className="h-4 w-4" />
                ) : (
                  <Maximize2 className="h-4 w-4" />
                )}
              </button>
            ) : null}
            <button
              type="button"
              className="mini-player-icon-btn"
              onClick={onStop}
              title="Close player"
              aria-label="Close player"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
