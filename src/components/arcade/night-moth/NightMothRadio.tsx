"use client";

import { useMemo } from "react";
import { NightMothCabinet } from "@/components/arcade/ArcadeCabinet";
import {
  BRIGHTNESS_MAX,
  BRIGHTNESS_MIN,
  type ArcadePrefs,
  writeArcadePrefs,
} from "@/lib/client/arcade-prefs";

export type RadioStation = {
  id: number;
  title: string;
  name: string;
  durationMs: number | null;
};

export function NightMothRadioStrip({
  prefs,
  stations,
  playing,
  onPrev,
  onNext,
  onToggle,
  onOpenSettings,
}: {
  prefs: ArcadePrefs;
  stations: RadioStation[];
  playing: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToggle: () => void;
  onOpenSettings: () => void;
}) {
  const current = stations.find((s) => s.id === prefs.radioIds[prefs.radioIndex])
    ?? stations.find((s) => s.id === prefs.radioIds[0]);
  const label = prefs.radioIds.length === 0
    ? "No station — set a playlist"
    : current
      ? current.title
      : "Station missing from catalog";
  return (
    <div className="nm-radio">
      <span className="nm-radio-k">Radio</span>
      <button type="button" className="nm-radio-btn" onClick={onPrev} title="Previous station">
        ◀
      </button>
      <button type="button" className="nm-radio-btn" onClick={onToggle} title={playing ? "Pause" : "Play"}>
        {playing ? "❚❚" : "▶"}
      </button>
      <button type="button" className="nm-radio-btn" onClick={onNext} title="Next station">
        ▶
      </button>
      <p className="nm-radio-now" title={label}>
        {label}
      </p>
      <button type="button" className="nm-radio-set" onClick={onOpenSettings}>
        Set
      </button>
    </div>
  );
}

export function NightMothSettings({
  prefs,
  stations,
  loading,
  onChange,
  onClose,
}: {
  prefs: ArcadePrefs;
  stations: RadioStation[];
  loading: boolean;
  onChange: (next: ArcadePrefs) => void;
  onClose: () => void;
}) {
  const selected = useMemo(() => new Set(prefs.radioIds), [prefs.radioIds]);

  function setBrightness(v: number) {
    onChange(writeArcadePrefs({ ...prefs, brightness: v }));
  }
  function setVolume(v: number) {
    onChange(writeArcadePrefs({ ...prefs, radioVolume: v }));
  }
  function setGameVolume(v: number) {
    onChange(writeArcadePrefs({ ...prefs, gameVolume: v }));
  }
  function toggleStation(id: number) {
    const ids = selected.has(id)
      ? prefs.radioIds.filter((x) => x !== id)
      : [...prefs.radioIds, id];
    const radioIndex = Math.min(prefs.radioIndex, Math.max(0, ids.length - 1));
    onChange(writeArcadePrefs({ ...prefs, radioIds: ids, radioIndex }));
  }

  return (
    <NightMothCabinet marquee={["VISOR", "SETTINGS", "NIGHT MOTH"]} className="nm-settings">
      <div className="nm-cab-body">
      <label className="nm-set-row">
        <span>Brightness</span>
        <input
          type="range"
          min={BRIGHTNESS_MIN}
          max={BRIGHTNESS_MAX}
          step={0.02}
          value={prefs.brightness}
          onChange={(e) => setBrightness(Number(e.target.value))}
        />
        <span className="nm-set-val">{prefs.brightness.toFixed(2)}</span>
      </label>
      <label className="nm-set-row">
        <span>Game volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={prefs.gameVolume}
          onChange={(e) => setGameVolume(Number(e.target.value))}
        />
        <span className="nm-set-val">{Math.round(prefs.gameVolume * 100)}</span>
      </label>
      <label className="nm-set-row">
        <span>Music volume</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.02}
          value={prefs.radioVolume}
          onChange={(e) => setVolume(Number(e.target.value))}
        />
        <span className="nm-set-val">{Math.round(prefs.radioVolume * 100)}</span>
      </label>

      <h3 className="nm-set-h">Stations from the stacks</h3>
      <p className="nm-lede nm-set-lede">
        Audio holdings become the after-hours band. Tick what should play.
        The in-game radio steps through that playlist.
      </p>
      {loading ? (
        <p className="nm-set-empty">Listening for the catalog…</p>
      ) : stations.length === 0 ? (
        <p className="nm-set-empty">
          No audio holdings yet. Acquire or index a track, then come back.
        </p>
      ) : (
        <ul className="nm-set-list">
          {stations.map((s) => (
            <li key={s.id}>
              <label className="nm-set-track">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={() => toggleStation(s.id)}
                />
                <span>
                  <strong>{s.title}</strong>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="nm-meta">
        {prefs.radioIds.length} station{prefs.radioIds.length === 1 ? "" : "s"} queued
        · <kbd>[</kbd> <kbd>]</kbd> tune · <kbd>M</kbd> play · <kbd>F8</kbd> shot
      </p>
      <div className="nm-actions">
        <button type="button" className="btn btn-helix" onClick={onClose}>
          Close
        </button>
      </div>
      </div>
    </NightMothCabinet>
  );
}
