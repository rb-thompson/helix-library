"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ABILITIES,
  ABILITY_ORDER,
  CONDITIONS,
  LAMP_ORDER,
  LAMPS,
  NIGHT_MOTH_GAME_ID,
  nextUnlock,
} from "@/lib/arcade/night-moth";
import { ArcadeCabinet } from "@/components/arcade/ArcadeCabinet";
import type { ArcadeProgress, ArcadeScore } from "@/lib/arcade/scores";
import {
  mergeBoards,
  readLocalBoard,
  rememberScore,
  sanitizeInitials,
} from "@/lib/client/arcade-board";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { cn } from "@/lib/cn";
import type { EngineSnapshot, RunResult } from "./engine";
import type { NightMothHandle } from "./NightMothCanvas";

const NightMothCanvas = dynamic(
  () => import("./NightMothCanvas").then((m) => m.NightMothCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="nm-canvas nm-canvas--boot">
        <HelixSpinner size="lg" label="Opening the grounds" />
        <span>The lamps are waking…</span>
      </div>
    ),
  },
);

type Overlay = "none" | "title" | "howto" | "scores" | "pause" | "dead";

export function NightMothGame({
  initialScores,
  initialProgress,
}: {
  initialScores: ArcadeScore[];
  initialProgress: ArcadeProgress;
}) {
  const handleRef = useRef<NightMothHandle | null>(null);
  const [snap, setSnap] = useState<EngineSnapshot | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("title");
  const [scores, setScores] = useState(initialScores);
  const [progress, setProgress] = useState(initialProgress);
  const [result, setResult] = useState<RunResult | null>(null);
  const [beginner, setBeginner] = useState(!initialProgress.tutorialDone);
  const [initials, setInitials] = useState("MTH");
  const loggedRef = useRef<string | null>(null);

  const onReady = useCallback((h: NightMothHandle) => {
    handleRef.current = h;
  }, []);

  const pullBoard = useCallback(async () => {
    try {
      const res = await fetch(`/api/arcade/scores?game=${NIGHT_MOTH_GAME_ID}`);
      const json = (await res.json()) as { scores?: ArcadeScore[] };
      if (json.scores) {
        setScores(mergeBoards(json.scores, readLocalBoard()));
        return;
      }
    } catch {
      /* fall through to local */
    }
    setScores((prev) => mergeBoards(prev, readLocalBoard()));
  }, []);

  const logRun = useCallback(
    async (r: RunResult, tag = initials) => {
      const key = `${r.score}-${r.night}-${r.durationMs}`;
      if (loggedRef.current === key) return;
      loggedRef.current = key;
      const optimistic: ArcadeScore = {
        id: Date.now(),
        game: NIGHT_MOTH_GAME_ID,
        score: r.score,
        night: r.night,
        nectar: r.nectar,
        durationMs: r.durationMs,
        abilities: r.abilities,
        createdAt: Date.now(),
        initials: sanitizeInitials(tag),
      };
      setScores((prev) => mergeBoards(rememberScore(optimistic), prev));
      try {
        const res = await fetch("/api/arcade/scores", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            game: NIGHT_MOTH_GAME_ID,
            score: r.score,
            night: r.night,
            nectar: r.nectar,
            durationMs: r.durationMs,
            abilities: r.abilities,
            initials: sanitizeInitials(tag),
          }),
        });
        const json = (await res.json()) as { scores?: ArcadeScore[] };
        if (json.scores) setScores(mergeBoards(json.scores, readLocalBoard()));
      } catch {
        /* local board already has the run */
      }
    },
    [initials],
  );

  useEffect(() => {
    setScores((prev) => mergeBoards(prev, readLocalBoard()));
    void pullBoard();
  }, [pullBoard]);

  const persistProgress = useCallback(
    async (xp: number, tutorialDone: boolean) => {
      setProgress((prev) => ({
        ...prev,
        xp,
        tutorialDone: tutorialDone || prev.tutorialDone,
        updatedAt: Date.now(),
      }));
      try {
        const res = await fetch("/api/arcade/progress", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            game: NIGHT_MOTH_GAME_ID,
            xp,
            tutorialDone: tutorialDone || progress.tutorialDone,
          }),
        });
        const json = (await res.json()) as { progress?: ArcadeProgress };
        if (json.progress) setProgress(json.progress);
      } catch {
        /* local state already updated */
      }
    },
    [progress.tutorialDone],
  );

  const hooks = useMemo(
    () => ({
      onSnapshot: (s: EngineSnapshot) => {
        setSnap(s);
        if (s.mode === "playing" && overlay !== "howto") setOverlay("none");
        if (s.mode === "paused") setOverlay("pause");
        if (s.mode === "title") setOverlay((o) => (o === "howto" || o === "scores" ? o : "title"));
      },
      onDeath: (r: RunResult) => {
        setResult(r);
        setOverlay("dead");
        void logRun(r);
      },
      onProgress: (xp: number, tutorialDone: boolean) => {
        void persistProgress(xp, tutorialDone);
      },
    }),
    [overlay, persistProgress, logRun],
  );

  const start = useCallback(
    (tutorial: boolean) => {
      handleRef.current?.start({
        tutorial,
        xp: progress.xp,
        unlocked: progress.unlocked,
      });
      setResult(null);
      loggedRef.current = null;
      setOverlay("none");
    },
    [progress.unlocked, progress.xp],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "h" || e.key === "H" || e.key === "?") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const el = e.target as HTMLElement | null;
        if (el?.closest("input, textarea")) return;
        e.preventDefault();
        setOverlay((o) => {
          if (o === "howto") {
            if (snap?.mode === "paused") return "pause";
            if (snap?.mode === "playing") {
              handleRef.current?.resume();
              return "none";
            }
            return "title";
          }
          if (snap?.mode === "playing") handleRef.current?.pause();
          return "howto";
        });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [snap?.mode]);

  const next = nextUnlock(progress.xp);
  const playing = snap?.mode === "playing" || snap?.mode === "paused";

  return (
    <div className="nm-play">
      <NightMothCanvas hooks={hooks} onReady={onReady} />

      {snap && playing ? (
        <PlayHud
          snap={snap}
          onCycle={(d) => handleRef.current?.cycleAbility(d)}
          onSelect={(id) => handleRef.current?.selectAbility(id)}
        />
      ) : null}

      {overlay === "title" ? (
        <div className="nm-overlay">
          <div className="nm-card nm-card--title">
            <p className="eyebrow">Arcade · after hours</p>
            <h1 className="nm-title">Night Moth</h1>
            <p className="nm-lede">
              Not every lamp is Circulation. The grounds run from the court to
              the fen — grove, stacks, terrace, yard, hollow, plaza. Fly where
              the visor points. Drink what is true. Dust what is not.
            </p>
            <div className="nm-actions">
              <button
                type="button"
                className="btn btn-helix"
                onClick={() => start(beginner)}
              >
                {beginner ? "First night" : "Begin flight"}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOverlay("howto")}
              >
                Field guide
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void pullBoard();
                  setOverlay("scores");
                }}
              >
                High scores
              </button>
            </div>
            <label className="nm-check">
              <input
                type="checkbox"
                checked={beginner}
                onChange={(e) => setBeginner(e.target.checked)}
              />
              Optional beginner night — three lamps, named.
            </label>
            <p className="nm-meta">
              Persistent XP {progress.xp}
              {next
                ? ` · ${next.remaining} to ${next.name}`
                : " · every ability is open"}
            </p>
          </div>
        </div>
      ) : null}

      {overlay === "howto" ? (
        <div className="nm-overlay">
          <FieldGuide
            xp={progress.xp}
            onClose={() => {
              if (snap?.mode === "paused") setOverlay("pause");
              else if (snap?.mode === "playing") setOverlay("none");
              else setOverlay("title");
            }}
          />
        </div>
      ) : null}

      {overlay === "scores" ? (
        <div className="nm-overlay">
          <ArcadeCabinet
            scores={scores}
            onBack={() => setOverlay("title")}
          />
        </div>
      ) : null}

      {overlay === "pause" ? (
        <div className="nm-overlay nm-overlay--thin">
          <div className="nm-card">
            <p className="eyebrow">Still air</p>
            <h2 className="nm-h2">Paused</h2>
            <p className="nm-lede">
              The lamps wait. They do not grow kinder.
            </p>
            <div className="nm-actions">
              <button
                type="button"
                className="btn btn-helix"
                onClick={() => handleRef.current?.resume()}
              >
                Resume
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOverlay("howto")}
              >
                Field guide
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const run = handleRef.current?.snapshotRun();
                  if (run && run.score > 0) void logRun(run);
                  handleRef.current?.toTitle();
                  setOverlay("title");
                }}
              >
                Leave the grounds
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {overlay === "dead" && result ? (
        <div className="nm-overlay">
          <ArcadeCabinet
            scores={scores}
            highlight={result.score}
            result={result}
            initials={initials}
            onInitials={setInitials}
            onRelog={() => {
              loggedRef.current = null;
              void logRun(result, initials);
            }}
            xpLine={
              nextUnlock(progress.xp)
                ? `Lifetime XP ${progress.xp} · ${nextUnlock(progress.xp)!.remaining} to ${nextUnlock(progress.xp)!.name}`
                : `Lifetime XP ${progress.xp}`
            }
            actions={
              <>
                <button
                  type="button"
                  className="btn btn-helix"
                  onClick={() => start(false)}
                >
                  Another night
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => start(true)}
                >
                  Beginner night
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    handleRef.current?.toTitle();
                    setOverlay("title");
                  }}
                >
                  Title
                </button>
              </>
            }
          />
        </div>
      ) : null}
    </div>
  );
}

function PlayHud({
  snap,
  onCycle,
  onSelect,
}: {
  snap: EngineSnapshot;
  onCycle: (dir: 1 | -1) => void;
  onSelect: (id: EngineSnapshot["selected"]) => void;
}) {
  const pip = snap.pipDeg;
  const pipClamped = pip == null ? 0 : Math.max(-34, Math.min(34, pip * 0.38));
  return (
    <div className="nm-hud" aria-live="polite">
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
      <div className="nm-hud-top">
        <div className="nm-stat">
          <span className="nm-stat-k">Night</span>
          <span className="nm-stat-v">{snap.tutorial ? "0 · lesson" : snap.night}</span>
        </div>
        <div className="nm-stat">
          <span className="nm-stat-k">Score</span>
          <span className="nm-stat-v">{snap.score.toLocaleString()}</span>
        </div>
        <div className="nm-stat">
          <span className="nm-stat-k">Combo</span>
          <span className="nm-stat-v">×{Math.max(1, snap.combo)}</span>
        </div>
        <div className="nm-stat">
          <span className="nm-stat-k">Nectar</span>
          <span className="nm-stat-v">{snap.nectar}</span>
        </div>
      </div>

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
      </div>

      <p className="nm-objective">{snap.objective}</p>

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
          <p className="nm-lamp-tell">{snap.nearest.tell}</p>
          {snap.nearest.canSip ? (
            <p className="nm-lamp-act">E — drink this lamp</p>
          ) : (
            <p className="nm-lamp-act">
              {snap.nearest.range.toFixed(0)}m · fly closer
            </p>
          )}
        </div>
      ) : null}

      <Radar blips={snap.blips} heading={snap.heading} />

      {snap.tutorial ? (
        <div className="nm-tutor">
          <p className="nm-tutor-k">Beginner night</p>
          <p>{snap.tutorialHint}</p>
        </div>
      ) : null}

      {snap.message ? <p className="nm-toast">{snap.message}</p> : null}

      <p className="nm-lock">
        {snap.pointerLocked
          ? "W fly · E drink · click fires equipped art · wheel / Tab cycle · Esc pause"
          : "Drag to look, or click to lock · W flies · wheel cycles arts"}
      </p>

      <div className="nm-hud-bot">
        <div className="nm-bars">
          <Bar label="Wing" value={snap.hp} max={snap.maxHp} tone="hp" />
          <Bar label="Stamina" value={snap.stamina} max={100} tone="st" />
        </div>
        {snap.conditions.length > 0 ? (
          <ul className="nm-status">
            {snap.conditions.map((c) => (
              <li key={c.id} className={`nm-status-item is-${c.tone}`}>
                <span className="nm-status-name">{c.name}</span>
                <span className="nm-status-how">{CONDITIONS[c.id].summary}</span>
                <span className="nm-status-bar">
                  <span
                    style={{
                      width: `${Math.min(100, (c.remaining / CONDITIONS[c.id].duration) * 100)}%`,
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="nm-dock">
          <button type="button" className="nm-dock-step" onClick={() => onCycle(-1)}>
            ← Q
          </button>
          <div className="nm-dock-main">
            <p className="nm-dock-k">
              Equipped · {ABILITIES[snap.selected].key} · click to fire
            </p>
            <p className="nm-dock-name">{ABILITIES[snap.selected].name}</p>
            <p className="nm-dock-how">{ABILITIES[snap.selected].how}</p>
          </div>
          <button type="button" className="nm-dock-step" onClick={() => onCycle(1)}>
            Tab →
          </button>
        </div>
        <ul className="nm-abs">
          {snap.abilities
            .filter((a) => a.unlocked)
            .map((a) => (
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
      </div>
    </div>
  );
}

function Radar({
  blips,
}: {
  blips: EngineSnapshot["blips"];
  heading: string;
}) {
  const scale = 3.2;
  return (
    <div className="nm-radar" aria-hidden>
      <span className="nm-radar-you" />
      {blips.slice(0, 36).map((b, i) => {
        const x = Math.max(-46, Math.min(46, b.dx / scale));
        const y = Math.max(-46, Math.min(46, -b.dz / scale));
        const tone = b.drunk
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
  tone: "hp" | "st";
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="nm-bar">
      <span className="nm-bar-l">{label}</span>
      <span className="nm-bar-track">
        <span className={`nm-bar-fill is-${tone}`} style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

function FieldGuide({ xp, onClose }: { xp: number; onClose: () => void }) {
  return (
    <div className="nm-jacket">
      <header className="nm-jacket-cover">
        <p className="nm-jacket-kicker">Helix Arcade · instruction jacket</p>
        <h2>Night Moth</h2>
        <p className="nm-jacket-tag">
          Not every lamp is Circulation. Fly. Judge. Drink. Dust. Leave a
          score on the desk.
        </p>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="nm-jacket-panel">
        <h3>1 · How to fly</h3>
        <ol className="nm-jacket-steps">
          <li>
            <kbd>Mouse</kbd> looks. <kbd>W</kbd> flies where the visor points.
          </li>
          <li>
            <kbd>A</kbd> <kbd>D</kbd> slip. <kbd>S</kbd> brakes. <kbd>Shift</kbd> dashes.
          </li>
          <li>
            <kbd>E</kbd> drinks a near lamp. True lamps heal. Lures bite.
          </li>
          <li>
            <kbd>Click</kbd> fires the equipped art. Scroll or <kbd>Tab</kbd> /{" "}
            <kbd>Q</kbd> cycles. Number keys select.
          </li>
          <li>
            Amber pip = next true lamp. Radar is north-up. Towers hide caches.
          </li>
        </ol>
      </section>
        <section className="nm-jacket-panel">
          <h3>2 · Lamps</h3>
          <p>
            Lamps wander. A Circulation may wake in the fen. Color is a rumor;
            pulse is evidence; motion is a confession. Small moths on a lamp
            are friends. They are not prey.
          </p>
          <ul className="nm-bestiary">
            {LAMP_ORDER.map((id) => {
              const l = LAMPS[id];
              return (
                <li key={id}>
                  <span
                    className="nm-swatch"
                    style={{ background: `#${l.color.toString(16).padStart(6, "0")}` }}
                  />
                  <span>
                    <strong>{l.name}</strong>
                    <span className="nm-align">
                      {l.alignment === "true" ? "true" : "lure"}
                    </span>
                    <em>{l.tell}</em>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="nm-jacket-panel">
          <h3>3 · Arts</h3>
          <p>
            Equip with the wheel or the dock. Click fires whatever is
            equipped. XP stays after death.
          </p>
          <ul className="nm-ab-list">
            {ABILITY_ORDER.map((id) => {
              const a = ABILITIES[id];
              const open = xp >= a.xp;
              return (
                <li key={id} className={open ? "is-open" : "is-locked"}>
                  <span className="nm-ab-k">{a.key}</span>
                  <span>
                    <strong>{a.name}</strong>
                    <em>{open ? `${a.how} ${a.summary}` : `Locked · ${a.xp} XP`}</em>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="nm-jacket-panel">
          <h3>4 · Conditions</h3>
          <ul className="nm-ab-list">
            {(Object.keys(CONDITIONS) as Array<keyof typeof CONDITIONS>).map(
              (id) => {
                const c = CONDITIONS[id];
                return (
                  <li key={id}>
                    <span className={`nm-cond is-${c.tone}`}>{c.tone}</span>
                    <span>
                      <strong>{c.name}</strong>
                      <em>{c.summary}</em>
                    </span>
                  </li>
                );
              },
            )}
          </ul>
        </section>
        <section className="nm-jacket-panel">
          <h3>5 · The grounds</h3>
          <p>
            Eight regions, two canals with fish, fireflies, and three noir
            towers. Climb the neon frames for caches — nectar, score, a little
            wing. Lamps reshuffle. Follow the pip, not the last place you
            drank.
          </p>
        </section>
    </div>
  );
}
