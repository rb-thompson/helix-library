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
import { ArcadeCabinet, NightMothCabinet } from "@/components/arcade/ArcadeCabinet";
import type { ArcadeProgress, ArcadeScore } from "@/lib/arcade/scores";
import {
  mergeBoards,
  readLocalBoard,
  rememberScore,
  sanitizeInitials,
} from "@/lib/client/arcade-board";
import {
  readArcadePrefs,
  writeArcadePrefs,
  type ArcadePrefs,
} from "@/lib/client/arcade-prefs";
import { toast } from "@/lib/client/toasts";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { NightMothHud } from "./NightMothHud";
import {
  NightMothRadioStrip,
  NightMothSettings,
  type RadioStation,
} from "./NightMothRadio";
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

type Overlay = "none" | "title" | "howto" | "scores" | "pause" | "dead" | "settings";

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
  const [prefs, setPrefs] = useState<ArcadePrefs>(() => readArcadePrefs());
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [stationsLoading, setStationsLoading] = useState(false);
  const [radioOn, setRadioOn] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const radioTouched = useRef(false);
  const settingsFrom = useRef<Overlay>("title");
  const loggedRef = useRef<string | null>(null);

  const onReady = useCallback((h: NightMothHandle) => {
    handleRef.current = h;
    const p = readArcadePrefs();
    h.setExposure(p.brightness);
    h.setGameVolume(p.gameVolume);
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
      if (r.score < 1) return;
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

  const pullStations = useCallback(async () => {
    setStationsLoading(true);
    try {
      const res = await fetch("/api/arcade/radio");
      const json = (await res.json()) as { stations?: RadioStation[] };
      if (json.stations) setStations(json.stations);
    } catch {
      /* keep last list */
    } finally {
      setStationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void pullStations();
  }, [pullStations]);

  useEffect(() => {
    handleRef.current?.setExposure(prefs.brightness);
    handleRef.current?.setGameVolume(prefs.gameVolume);
  }, [prefs.brightness, prefs.gameVolume]);

  const currentStationId = prefs.radioIds[Math.min(prefs.radioIndex, Math.max(0, prefs.radioIds.length - 1))] ?? null;

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = prefs.radioVolume;
  }, [prefs.radioVolume]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (currentStationId == null) {
      el.pause();
      el.removeAttribute("src");
      setRadioOn(false);
      return;
    }
    const src = `/api/media/${currentStationId}`;
    if (el.getAttribute("data-id") !== String(currentStationId)) {
      el.src = src;
      el.setAttribute("data-id", String(currentStationId));
      if (radioTouched.current) {
        void el.play().then(
          () => setRadioOn(true),
          () => setRadioOn(false),
        );
      }
    }
  }, [currentStationId]);

  const setRadioIndex = useCallback(
    (index: number) => {
      if (prefs.radioIds.length === 0) return;
      const next = ((index % prefs.radioIds.length) + prefs.radioIds.length) % prefs.radioIds.length;
      setPrefs(writeArcadePrefs({ ...prefs, radioIndex: next }));
    },
    [prefs],
  );

  const openSettings = useCallback(() => {
    setOverlay((o) => {
      settingsFrom.current = o === "settings" ? settingsFrom.current : o;
      if (snap?.mode === "playing") handleRef.current?.pause();
      return "settings";
    });
    void pullStations();
  }, [pullStations, snap?.mode]);

  const closeSettings = useCallback(() => {
    const from = settingsFrom.current;
    if (from === "none" && snap?.mode === "paused") {
      handleRef.current?.resume();
      setOverlay("none");
      return;
    }
    if (from === "pause") setOverlay("pause");
    else if (from === "howto") setOverlay("howto");
    else if (snap?.mode === "playing") {
      handleRef.current?.resume();
      setOverlay("none");
    } else setOverlay(from === "settings" ? "title" : from);
  }, [snap?.mode]);

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
        if (s.mode === "playing" && overlay !== "howto" && overlay !== "settings") {
          setOverlay("none");
        }
        if (s.mode === "paused") {
          setOverlay((o) => (o === "settings" || o === "howto" ? o : "pause"));
        }
        if (s.mode === "title") {
          setOverlay((o) =>
            o === "howto" || o === "scores" || o === "settings" ? o : "title",
          );
        }
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

  const fileShot = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    try {
      const dataUrl = h.captureFrame();
      const res = await fetch("/api/arcade/shot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          dataUrl,
          region: snap?.region ?? "grounds",
          night: snap?.night ?? 1,
        }),
      });
      const json = (await res.json()) as { itemId?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not file the shot");
      toast({
        tone: "ok",
        title: "Shot filed to the archive",
        detail: "Tagged night-moth · screenshot · arcade",
        href: json.itemId ? `/catalog/${json.itemId}` : "/catalog",
      });
    } catch (err) {
      toast({
        tone: "warn",
        title: "The visor could not keep that frame",
        detail: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }, [snap?.night, snap?.region]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && overlay === "settings") {
        e.preventDefault();
        closeSettings();
        return;
      }
      const el = e.target as HTMLElement | null;
      if (el?.closest("input, textarea, select, [contenteditable='true']")) return;

      if (e.key === "[" || e.key === "]") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (prefs.radioIds.length === 0) return;
        e.preventDefault();
        e.stopPropagation();
        radioTouched.current = true;
        setRadioIndex(prefs.radioIndex + (e.key === "]" ? 1 : -1));
        return;
      }
      if (e.key === "m" || e.key === "M") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        e.preventDefault();
        const audio = audioRef.current;
        if (!audio || currentStationId == null) {
          openSettings();
          return;
        }
        radioTouched.current = true;
        if (audio.paused) void audio.play();
        else audio.pause();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        void fileShot();
        return;
      }
      if (e.key === "o" || e.key === "O") {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        const el = e.target as HTMLElement | null;
        if (el?.closest("input, textarea")) return;
        e.preventDefault();
        if (overlay === "settings") closeSettings();
        else openSettings();
        return;
      }
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
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [snap?.mode, overlay, openSettings, closeSettings, prefs.radioIds.length, prefs.radioIndex, setRadioIndex, currentStationId, fileShot]);

  const next = nextUnlock(progress.xp);
  const playing = snap?.mode === "playing" || snap?.mode === "paused";

  return (
    <div className="nm-play">
      <audio
        ref={audioRef}
        preload="none"
        onEnded={() => {
          if (prefs.radioIds.length > 1) setRadioIndex(prefs.radioIndex + 1);
          else setRadioOn(false);
        }}
        onPlay={() => setRadioOn(true)}
        onPause={() => setRadioOn(false)}
      />
      <NightMothCanvas hooks={hooks} onReady={onReady} />

      {snap && playing ? (
        <NightMothHud
          snap={snap}
          onCycle={(d) => handleRef.current?.cycleAbility(d)}
          onSelect={(id) => handleRef.current?.selectAbility(id)}
          radio={
            <NightMothRadioStrip
              prefs={prefs}
              stations={stations}
              playing={radioOn}
              onPrev={() => {
                radioTouched.current = true;
                setRadioIndex(prefs.radioIndex - 1);
              }}
              onNext={() => {
                radioTouched.current = true;
                setRadioIndex(prefs.radioIndex + 1);
              }}
              onToggle={() => {
                const el = audioRef.current;
                if (!el) return;
                if (currentStationId == null) {
                  openSettings();
                  return;
                }
                radioTouched.current = true;
                if (el.paused) void el.play().then(
                  () => setRadioOn(true),
                  () => setRadioOn(false),
                );
                else el.pause();
              }}
              onOpenSettings={openSettings}
            />
          }
        />
      ) : null}

      {overlay === "title" ? (
        <div className="nm-overlay">
          <NightMothCabinet marquee={["AFTER HOURS", "NIGHT MOTH", "ARCADE"]}>
            <div className="nm-cab-body">
              <p className="nm-cab-run-k">Not every lamp is Circulation</p>
              <h1 className="nm-title">Night Moth</h1>
              <div className="nm-actions">
                <button
                  type="button"
                  className="btn btn-helix"
                  onClick={() => start(beginner)}
                >
                  {beginner ? "First night" : "Begin flight"}
                </button>
              </div>
              <p className="nm-meta nm-title-links">
                <button type="button" onClick={() => setOverlay("howto")}>
                  Field guide
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    void pullBoard();
                    setOverlay("scores");
                  }}
                >
                  High scores
                </button>
                {" · "}
                <button type="button" onClick={openSettings}>
                  Settings
                </button>
              </p>
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
          </NightMothCabinet>
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
          <NightMothCabinet marquee={["STILL AIR", "PAUSED", "NIGHT MOTH"]}>
            <div className="nm-cab-body">
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
              </div>
              <p className="nm-meta nm-title-links">
                <button type="button" onClick={() => setOverlay("howto")}>
                  Field guide
                </button>
                {" · "}
                <button type="button" onClick={openSettings}>
                  Settings
                </button>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    const run = handleRef.current?.snapshotRun();
                    if (run && run.score > 0) void logRun(run);
                    handleRef.current?.toTitle();
                    setOverlay("title");
                  }}
                >
                  Leave the grounds
                </button>
              </p>
            </div>
          </NightMothCabinet>
        </div>
      ) : null}

      {overlay === "settings" ? (
        <div className="nm-overlay">
          <NightMothSettings
            prefs={prefs}
            stations={stations}
            loading={stationsLoading}
            onChange={(next) => {
              setPrefs(next);
              handleRef.current?.setExposure(next.brightness);
              handleRef.current?.setGameVolume(next.gameVolume);
            }}
            onClose={closeSettings}
          />
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

function FieldGuide({ xp, onClose }: { xp: number; onClose: () => void }) {
  return (
    <NightMothCabinet
      wide
      className="nm-cab--guide"
      marquee={["NIGHT MOTH", "FIELD GUIDE", "JACKET"]}
    >
      <header className="nm-jacket-cover">
        <div>
          <p className="nm-jacket-tag">
            Fly. Judge. Drink. Dust. Leave a score on the desk.
          </p>
        </div>
        <button type="button" className="btn btn-helix" onClick={onClose}>
          Close
        </button>
      </header>

      <div className="nm-jacket-grid">
        <section className="nm-jacket-panel">
          <h3>1 · How to fly</h3>
          <ol className="nm-jacket-steps">
            <li>
              <kbd>Mouse</kbd> looks. <kbd>W</kbd> flies where the visor points.
            </li>
            <li>
              <kbd>A</kbd> <kbd>D</kbd> slip. <kbd>S</kbd> brakes.{" "}
              <kbd>Shift</kbd> dashes.
            </li>
            <li>
              <kbd>E</kbd> drinks a near lamp. True lamps heal. Lures bite.
            </li>
            <li>
              <kbd>Click</kbd> fires the equipped art. Scroll or <kbd>Tab</kbd> /{" "}
              <kbd>Q</kbd> cycles. Number keys select.
            </li>
            <li>
              Amber pip = next true lamp. Radar is north-up. Roofs are solid —
              you can perch.
            </li>
            <li>
              <kbd>O</kbd> settings. <kbd>[</kbd> <kbd>]</kbd> radio.{" "}
              <kbd>F8</kbd> files a shot.
            </li>
          </ol>
        </section>
        <section className="nm-jacket-panel">
          <h3>2 · Lamps</h3>
          <p>
            Judge the shade, not the card. Color is a rumor; pulse is evidence;
            motion is a confession. Small moths on a lamp are friends.
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
                    <em>
                      {l.shape}. {l.tell}
                    </em>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="nm-jacket-panel">
          <h3>3 · Arts</h3>
          <p>
            Equip with the wheel or the dock. Click fires whatever is equipped.
            XP stays after death.
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
                    {open ? (
                      <em>
                        {a.how} {a.summary}
                      </em>
                    ) : (
                      <em>Locked · {a.xp} XP</em>
                    )}
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
            The Ward is streets and stoops. The Acre is farm, orchard, and the
            boiler hill. The retreat west of court is archive and chill — fly
            there to lose a bat. Waterways run fen to plaza. The rim is
            mountains. A cave opens under the hollow. Brick, trees, and roofs
            hold the wing.
          </p>
        </section>
        <section className="nm-jacket-panel">
          <h3>6 · Life after Hours</h3>
          <ul className="nm-ab-list">
            <li>
              <span className="nm-cond is-mixed">foe</span>
              <span>
                <strong>Mites</strong>
                <em>Green dart, purple pack, blue orbit. Dust them.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-mixed">foe</span>
              <span>
                <strong>Ground beetles</strong>
                <em>One wanderer on the dirt. Stay off the soil.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-bane">trap</span>
              <span>
                <strong>Spider webs</strong>
                <em>Invisible until you fly low into silk. Mash Space.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-boon">friend</span>
              <span>
                <strong>Honeysuckle &amp; moonflower</strong>
                <em>E to pollinate. Night bloom pays nectar.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-boon">friend</span>
              <span>
                <strong>Dragonflies</strong>
                <em>Over the water. Fly with them for a little glow.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-bane">boss</span>
              <span>
                <strong>Bat</strong>
                <em>Announced. Kill it or reach the retreat.</em>
              </span>
            </li>
            <li>
              <span className="nm-cond is-bane">boss</span>
              <span>
                <strong>Wasp</strong>
                <em>Announced. No escape. Kill it.</em>
              </span>
            </li>
          </ul>
          <p>
            Auroras arrive unannounced and sweeten the score. Infestations
            shout. <kbd>[</kbd> <kbd>]</kbd> tune the radio. <kbd>M</kbd> plays.{" "}
            <kbd>F8</kbd> files a shot to the archive.
          </p>
        </section>
      </div>
    </NightMothCabinet>
  );
}
