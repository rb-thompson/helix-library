"use client";

import {
  ABILITIES,
  CONDITIONS,
  MAP_MASSES,
} from "@/lib/arcade/night-moth";
import { cn } from "@/lib/cn";
import type { EngineSnapshot } from "./engine";
import type { ReactNode } from "react";

export function NightMothHud({
  snap,
  onCycle,
  onSelect,
  radio,
}: {
  snap: EngineSnapshot;
  onCycle: (dir: 1 | -1) => void;
  onSelect: (id: EngineSnapshot["selected"]) => void;
  radio?: ReactNode;
}) {
  const pip = snap.pipDeg;
  const pipClamped = pip == null ? 0 : Math.max(-34, Math.min(34, pip * 0.38));
  const unlocked = snap.abilities.filter((a) => a.unlocked);
  const equipped = ABILITIES[snap.selected];
  const line = snap.message ?? (snap.tutorial ? snap.tutorialHint : "");
  const hint = snap.pointerLocked
    ? "W fly · E drink · click fires · Esc"
    : "Drag to look · click canvas to lock · W flies";
  const critical = snap.hp < 30;
  const showHow = snap.tutorial || !snap.hasFired;

  return (
    <div
      className={cn(
        "nm-hud",
        critical && "is-critical",
        snap.mode === "paused" && "is-paused",
      )}
      aria-live="polite"
    >
      <div className="nm-visor" aria-hidden>
        <span className="nm-visor-corner is-tl" />
        <span className="nm-visor-corner is-tr" />
        <span className="nm-visor-corner is-bl" />
        <span className="nm-visor-corner is-br" />
        <span className="nm-reticle" />
      </div>
      <div
        className="nm-flash"
        style={{ opacity: snap.flash * 0.55 }}
        aria-hidden
      />

      <div className="nm-compass">
        <span className="nm-compass-h">{snap.heading}</span>
        <span className="nm-compass-r">{snap.region}</span>
        {pip != null ? (
          <span
            className="nm-pip"
            style={{ transform: `translateX(${pipClamped}px)` }}
            title="Nearest true lamp"
          />
        ) : null}
        {snap.trueLeft > 0 && !snap.tutorial ? (
          <span className="nm-compass-n">{snap.trueLeft} lit</span>
        ) : null}
      </div>

      {snap.event ? (
        <div className={`nm-event is-${snap.event.kind}`}>
          <p className="nm-event-k">Event</p>
          <p className="nm-event-title">{snap.event.title}</p>
          <p className="nm-event-line">{snap.event.line}</p>
          <p className="nm-event-t">{snap.event.remaining.toFixed(0)}s</p>
        </div>
      ) : null}

      {snap.webProgress > 0 ? (
        <div className="nm-web">
          <p>Silk — mash Space</p>
          <span className="nm-web-track">
            <span className="nm-web-fill" style={{ width: `${snap.webProgress * 100}%` }} />
          </span>
        </div>
      ) : null}

      {snap.nearest ? (
        <div
          className={cn(
            "nm-lamp",
            snap.nearest.canSip && "is-sip",
            snap.nearest.known && snap.nearest.safe === true && "is-true",
            snap.nearest.known && snap.nearest.safe === false && "is-lure",
          )}
        >
          <p className="nm-lamp-name">{snap.nearest.name}</p>
          {snap.nearest.tell ? <p className="nm-lamp-tell">{snap.nearest.tell}</p> : null}
          <p className="nm-lamp-act">
            {snap.nearest.canSip
              ? "E — drink"
              : snap.nearest.range < 8
                ? "Close — don’t pass through"
                : `${snap.nearest.range.toFixed(0)}m`}
          </p>
        </div>
      ) : null}

      <Radar
        blips={snap.blips}
        headingDeg={snap.headingDeg}
        posX={snap.posX}
        posZ={snap.posZ}
      />

      <div className="nm-console">
        <section className="nm-console-vitals" aria-label="Vitals">
          <ul className="nm-console-stats">
            <li>
              <span className="nm-stat-k">Night</span>
              <span className="nm-stat-v">
                {snap.tutorial ? "0" : snap.night}
              </span>
            </li>
            <li>
              <span className="nm-stat-k">Score</span>
              <span className="nm-stat-v">{snap.score.toLocaleString()}</span>
            </li>
            {snap.combo > 1 ? (
              <li>
                <span className="nm-stat-k">Combo</span>
                <span className="nm-stat-v">×{snap.combo}</span>
              </li>
            ) : null}
            {snap.nectar > 0 ? (
              <li>
                <span className="nm-stat-k">Nectar</span>
                <span className="nm-stat-v">{snap.nectar}</span>
              </li>
            ) : null}
          </ul>
          <Bar
            label="Wing"
            value={snap.hp}
            max={snap.maxHp}
            tone={critical ? "hp-low" : "hp"}
          />
          <Bar label="Stamina" value={snap.stamina} max={100} tone="st" />
          {snap.conditions.length > 0 ? (
            <ul className="nm-chips">
              {snap.conditions.map((c) => (
                <li key={c.id} className={`nm-chip is-${c.tone}`} title={CONDITIONS[c.id].summary}>
                  <span>{c.name}</span>
                  <span className="nm-chip-t">{c.remaining.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="nm-term" aria-label="Message terminal">
          <header className="nm-term-head">
            <span className="nm-term-live" />
            Terminal
            {snap.tutorial ? <span className="nm-term-tag">lesson</span> : null}
          </header>
          <p className="nm-term-line">{line || "The grounds are still."}</p>
          <p className="nm-term-hint">{hint}</p>
        </section>

        <section className="nm-console-arts" aria-label="Arts">
          <div className="nm-dock">
            <button type="button" className="nm-dock-step" onClick={() => onCycle(-1)}>
              Q
            </button>
            <div className="nm-dock-main">
              <p className="nm-dock-k">
                Equipped · {equipped.key} · click fires
              </p>
              <p className="nm-dock-name">{equipped.name}</p>
              {showHow ? <p className="nm-dock-how">{equipped.how}</p> : null}
            </div>
            <button type="button" className="nm-dock-step" onClick={() => onCycle(1)}>
              Tab
            </button>
          </div>
          <ul className="nm-abs">
            {unlocked.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className={cn("nm-ab", a.selected && "is-on", !a.ready && "is-cd")}
                  title={ABILITIES[a.id].how}
                  onClick={() => onSelect(a.id)}
                >
                  <span className="nm-ab-k">{a.key}</span>
                  <span className="nm-ab-n">{a.name}</span>
                  {!a.ready ? (
                    <span className="nm-ab-cd">{a.cooldown.toFixed(1)}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
          {radio}
        </section>
      </div>
    </div>
  );
}

function Radar({
  blips,
  headingDeg,
  posX,
  posZ,
}: {
  blips: EngineSnapshot["blips"];
  headingDeg: number;
  posX: number;
  posZ: number;
}) {
  const scale = 4.8;
  const clamp = (n: number) => Math.max(-78, Math.min(78, n));
  const ward = {
    x: clamp((72 - posX) / scale),
    y: clamp(-(8 - posZ) / scale),
  };
  const acre = {
    x: clamp((-70 - posX) / scale),
    y: clamp(-(20 - posZ) / scale),
  };
  return (
    <div className="nm-radar" aria-hidden>
      <span
        className="nm-radar-stain is-ward"
        style={{ transform: `translate(${ward.x}px, ${ward.y}px)` }}
      />
      <span
        className="nm-radar-stain is-acre"
        style={{ transform: `translate(${acre.x}px, ${acre.y}px)` }}
      />
      {MAP_MASSES.map((m, i) => {
        const x = clamp((m.x - posX) / scale);
        const y = clamp(-(m.z - posZ) / scale);
        const s = Math.max(3, m.s * 1.15);
        return (
          <span
            key={`m${i}`}
            className="nm-radar-mass"
            style={{
              width: s,
              height: s,
              transform: `translate(${x}px, ${y}px)`,
            }}
          />
        );
      })}
      {blips.slice(0, 36).map((b, i) => {
        const x = clamp(b.dx / scale);
        const y = clamp(-b.dz / scale);
        const tone = b.tone === "boss"
          ? "is-boss"
          : b.tone === "beetle"
            ? "is-beetle"
            : b.tone === "web"
              ? "is-web"
              : b.tone === "bloom"
                ? "is-bloom"
                : b.drunk
                  ? "is-dead"
                  : b.safe === true
                    ? "is-true"
                    : b.safe === false
                      ? "is-lure"
                      : "is-unk";
        return (
          <span
            key={i}
            className={`nm-radar-blip ${tone}`}
            style={{ transform: `translate(${x}px, ${y}px)` }}
          />
        );
      })}
      <span className="nm-radar-you" />
      <span
        className="nm-radar-head"
        style={{ transform: `translate(-50%, -50%) rotate(${headingDeg}deg)` }}
      />
    </div>
  );
}

function Bar({
  label,
  value,
  max,
  tone,
}: {
  label: string;
  value: number;
  max: number;
  tone: "hp" | "hp-low" | "st";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="nm-bar">
      <span className="nm-bar-l">{label}</span>
      <span className="nm-bar-track">
        <span className={`nm-bar-fill is-${tone}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="nm-bar-n">{Math.round(value)}</span>
    </div>
  );
}
