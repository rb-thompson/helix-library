"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MiniPlayerBar } from "@/components/player/MiniPlayerBar";

export type MiniTrack = {
  itemId: number;
  name: string;
  kind: "audio" | "video";
  mime?: string | null;
};

type PlayOpts = {
  startAt?: number;
  autoplay?: boolean;
};

type MiniPlayerContextValue = {
  track: MiniTrack | null;
  playing: boolean;
  currentTime: number;
  duration: number;
  expanded: boolean;
  isActiveItem: (itemId: number) => boolean;
  play: (track: MiniTrack, opts?: PlayOpts) => void;
  toggle: () => void;
  seek: (time: number) => void;
  skip: (deltaSec: number) => void;
  stop: () => void;
  setExpanded: (v: boolean) => void;
};

const MiniPlayerContext = createContext<MiniPlayerContextValue | null>(null);

export function useMiniPlayer(): MiniPlayerContextValue {
  const ctx = useContext(MiniPlayerContext);
  if (!ctx) {
    throw new Error("useMiniPlayer must be used within MiniPlayerProvider");
  }
  return ctx;
}

export function useMiniPlayerOptional(): MiniPlayerContextValue | null {
  return useContext(MiniPlayerContext);
}

function mediaSrc(itemId: number): string {
  return `/api/media/${itemId}`;
}

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const trackIdRef = useRef<number | null>(null);
  const pendingStartRef = useRef<number | null>(null);

  const [track, setTrack] = useState<MiniTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);

  const play = useCallback((next: MiniTrack, opts?: PlayOpts) => {
    const el = videoRef.current;
    const same = trackIdRef.current === next.itemId;
    trackIdRef.current = next.itemId;
    setTrack(next);

    const startAt =
      opts?.startAt != null && Number.isFinite(opts.startAt)
        ? Math.max(0, opts.startAt)
        : null;
    pendingStartRef.current = startAt;

    if (el) {
      if (!same) {
        el.src = mediaSrc(next.itemId);
        el.load();
      }
      if (startAt != null) {
        const applySeek = () => {
          try {
            el.currentTime = startAt;
            pendingStartRef.current = null;
          } catch {
            /* wait for metadata */
          }
        };
        if (el.readyState >= 1) applySeek();
      }
      if (opts?.autoplay !== false) {
        void el.play().then(
          () => setPlaying(true),
          () => setPlaying(false),
        );
      }
    } else {
      setPlaying(opts?.autoplay !== false);
    }
  }, []);

  const toggle = useCallback(() => {
    const el = videoRef.current;
    if (!el || trackIdRef.current == null) return;
    if (el.paused) {
      void el.play().then(
        () => setPlaying(true),
        () => setPlaying(false),
      );
    } else {
      el.pause();
      setPlaying(false);
    }
  }, []);

  const seek = useCallback((time: number) => {
    const el = videoRef.current;
    if (!el) return;
    const d = Number.isFinite(el.duration) ? el.duration : 0;
    const t = Math.max(0, d > 0 ? Math.min(d, time) : time);
    el.currentTime = t;
    setCurrentTime(t);
  }, []);

  const skip = useCallback(
    (deltaSec: number) => {
      const el = videoRef.current;
      if (!el) return;
      seek(el.currentTime + deltaSec);
    },
    [seek],
  );

  const stop = useCallback(() => {
    const el = videoRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    trackIdRef.current = null;
    pendingStartRef.current = null;
    setTrack(null);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setExpanded(false);
  }, []);

  const isActiveItem = useCallback(
    (itemId: number) => track?.itemId === itemId,
    [track?.itemId],
  );

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const onTime = () => setCurrentTime(el.currentTime || 0);
    const onMeta = () => {
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);
      if (pendingStartRef.current != null) {
        try {
          el.currentTime = pendingStartRef.current;
          pendingStartRef.current = null;
        } catch {
          /* ignore */
        }
      }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    const onDuration = () =>
      setDuration(Number.isFinite(el.duration) ? el.duration : 0);

    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onDuration);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnded);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onDuration);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnded);
    };
  }, []);

  useEffect(() => {
    if (
      !track ||
      typeof navigator === "undefined" ||
      !("mediaSession" in navigator)
    ) {
      return;
    }
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: "Helix Library",
        album: track.kind === "video" ? "Video" : "Audio",
      });
      navigator.mediaSession.setActionHandler("play", () => {
        void videoRef.current?.play();
      });
      navigator.mediaSession.setActionHandler("pause", () => {
        videoRef.current?.pause();
      });
      navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
      navigator.mediaSession.setActionHandler("seekforward", () => skip(10));
      navigator.mediaSession.setActionHandler("stop", () => stop());
    } catch {
      /* optional */
    }
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
        navigator.mediaSession.setActionHandler("stop", null);
      } catch {
        /* ignore */
      }
    };
  }, [track, skip, stop]);

  useEffect(() => {
    const root = document.documentElement;
    if (track) {
      root.classList.add("mini-player-open");
      root.classList.toggle(
        "mini-player-expanded",
        expanded && track.kind === "video",
      );
    } else {
      root.classList.remove("mini-player-open", "mini-player-expanded");
    }
    return () => {
      root.classList.remove("mini-player-open", "mini-player-expanded");
    };
  }, [track, expanded]);

  const value = useMemo<MiniPlayerContextValue>(
    () => ({
      track,
      playing,
      currentTime,
      duration,
      expanded,
      isActiveItem,
      play,
      toggle,
      seek,
      skip,
      stop,
      setExpanded,
    }),
    [
      track,
      playing,
      currentTime,
      duration,
      expanded,
      isActiveItem,
      play,
      toggle,
      seek,
      skip,
      stop,
    ],
  );

  return (
    <MiniPlayerContext.Provider value={value}>
      {children}
      <video
        ref={videoRef}
        className={[
          "mini-player-media",
          track ? "is-active" : "",
          track?.kind === "video" ? "is-video" : "is-audio",
          expanded && track?.kind === "video" ? "is-expanded" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        playsInline
        preload="metadata"
        controls={false}
        poster={
          track?.kind === "video" ? `/api/thumbs/${track.itemId}` : undefined
        }
      />
      <MiniPlayerBar
        track={track}
        playing={playing}
        currentTime={currentTime}
        duration={duration}
        expanded={expanded}
        onToggle={toggle}
        onSeek={seek}
        onSkip={skip}
        onStop={stop}
        onExpand={() => setExpanded((e) => !e)}
      />
    </MiniPlayerContext.Provider>
  );
}
