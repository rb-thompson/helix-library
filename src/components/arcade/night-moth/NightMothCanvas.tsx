"use client";

import { useEffect, useRef } from "react";
import {
  NightMothEngine,
  type EngineHooks,
  type StartOpts,
} from "./engine";

export type NightMothHandle = {
  start: (opts: StartOpts) => void;
  pause: () => void;
  resume: () => void;
  togglePause: () => void;
  toTitle: () => void;
  selectAbility: (id: StartOpts["unlocked"][number]) => void;
  cycleAbility: (dir: 1 | -1) => void;
  snapshotRun: () => {
    score: number;
    night: number;
    nectar: number;
    durationMs: number;
    xp: number;
    abilities: StartOpts["unlocked"];
  };
};

export function NightMothCanvas({
  hooks,
  onReady,
}: {
  hooks: EngineHooks;
  onReady: (handle: NightMothHandle) => void;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new NightMothEngine(el, {
      onSnapshot: (s) => hooksRef.current.onSnapshot(s),
      onDeath: (r) => hooksRef.current.onDeath(r),
      onProgress: (xp, done) => hooksRef.current.onProgress(xp, done),
    });
    onReady({
      start: (opts) => engine.start(opts),
      pause: () => engine.pause(),
      resume: () => engine.resume(),
      togglePause: () => engine.togglePause(),
      toTitle: () => engine.toTitle(),
      selectAbility: (id) => engine.selectAbility(id),
      cycleAbility: (dir) => engine.cycleAbility(dir),
      snapshotRun: () => engine.snapshotRun(),
    });
    const ro = new ResizeObserver(() => engine.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      engine.dispose();
    };
  }, [onReady]);

  return <div ref={mountRef} className="nm-canvas" />;
}
