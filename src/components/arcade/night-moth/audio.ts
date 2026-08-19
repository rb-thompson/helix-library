/**
 * Night Moth — small Web Audio bed. No samples; oscillators only.
 */

export type MothAudio = {
  setEffort: (n: number) => void;
  sip: (trueLamp: boolean) => void;
  zap: () => void;
  strike: () => void;
  night: () => void;
  death: () => void;
  setMuted: (m: boolean) => void;
  setVolume: (n: number) => void;
  dispose: () => void;
};

export function createMothAudio(): MothAudio {
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) {
    const noop = () => undefined;
    return {
      setEffort: noop,
      sip: noop,
      zap: noop,
      strike: noop,
      night: noop,
      death: noop,
      setMuted: noop,
      setVolume: noop,
      dispose: noop,
    };
  }

  const ctx = new Ctx();
  const master = ctx.createGain();
  let gain = 0.22;
  master.gain.value = gain;
  master.connect(ctx.destination);

  const drone = ctx.createOscillator();
  drone.type = "sine";
  drone.frequency.value = 46;
  const droneG = ctx.createGain();
  droneG.gain.value = 0.18;
  drone.connect(droneG).connect(master);
  drone.start();

  const drone2 = ctx.createOscillator();
  drone2.type = "triangle";
  drone2.frequency.value = 69;
  const drone2G = ctx.createGain();
  drone2G.gain.value = 0.05;
  drone2.connect(drone2G).connect(master);
  drone2.start();

  const wing = ctx.createOscillator();
  wing.type = "sawtooth";
  wing.frequency.value = 38;
  const wingF = ctx.createBiquadFilter();
  wingF.type = "lowpass";
  wingF.frequency.value = 280;
  const wingG = ctx.createGain();
  wingG.gain.value = 0.0;
  wing.connect(wingF).connect(wingG).connect(master);
  wing.start();

  let muted = false;
  function beep(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain = 0.12,
    slide?: number,
  ) {
    if (muted) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g).connect(master);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  return {
    setEffort(n) {
      const e = Math.max(0, Math.min(1, n));
      const t = ctx.currentTime;
      wingG.gain.setTargetAtTime(muted ? 0 : 0.015 + e * 0.045, t, 0.08);
      wing.frequency.setTargetAtTime(34 + e * 28, t, 0.1);
      if (ctx.state === "suspended") void ctx.resume();
    },
    sip(trueLamp) {
      if (trueLamp) {
        beep(520, 0.18, "sine", 0.1, 780);
        beep(780, 0.28, "triangle", 0.06, 1040);
      } else {
        beep(180, 0.25, "sawtooth", 0.1, 70);
      }
    },
    zap() {
      beep(90, 0.22, "square", 0.08, 40);
      beep(420, 0.08, "sawtooth", 0.05, 90);
    },
    strike() {
      beep(240, 0.08, "triangle", 0.07, 140);
    },
    night() {
      beep(196, 0.4, "sine", 0.08, 392);
    },
    death() {
      beep(220, 0.7, "sine", 0.1, 55);
    },
    setVolume(n) {
      gain = 0.22 * Math.max(0, Math.min(1, n));
      if (!muted) master.gain.setTargetAtTime(gain, ctx.currentTime, 0.05);
    },
    setMuted(m) {
      muted = m;
      master.gain.setTargetAtTime(m ? 0 : gain, ctx.currentTime, 0.05);
    },
    dispose() {
      try {
        drone.stop();
        drone2.stop();
        wing.stop();
        void ctx.close();
      } catch {
        /* already closed */
      }
    },
  };
}
