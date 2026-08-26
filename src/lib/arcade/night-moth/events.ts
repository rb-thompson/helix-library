/**
 * Timed night events — bosses, infestations, aurora.
 * Pure schedule. Engine only consumes the plan.
 */

import type { BossId } from "./fauna";

export type NightEventKind = "bat" | "wasp" | "aurora" | "mite-swarm" | "beetle-swarm";

export type EventPlan = {
  kind: NightEventKind;
  /** Seconds after night start. */
  at: number;
  duration: number;
  alert: boolean;
  trackable: boolean;
  title: string;
  line: string;
};

export function eventTitle(kind: NightEventKind): string {
  switch (kind) {
    case "bat":
      return "A bat takes the air";
    case "wasp":
      return "A wasp is hunting";
    case "aurora":
      return "Aurora";
    case "mite-swarm":
      return "Mite infestation";
    case "beetle-swarm":
      return "Beetle infestation";
  }
}

export function eventLine(kind: NightEventKind): string {
  switch (kind) {
    case "bat":
      return "Defeat it, or reach the retreat.";
    case "wasp":
      return "No escape. Kill it or it kills you.";
    case "aurora":
      return "";
    case "mite-swarm":
      return "The yard boils. Dust the swarm.";
    case "beetle-swarm":
      return "The soil opens. Stay off the dirt.";
  }
}

export function eventDuration(kind: NightEventKind): number {
  switch (kind) {
    case "bat":
      return 42;
    case "wasp":
      return 90;
    case "aurora":
      return 24;
    case "mite-swarm":
      return 22;
    case "beetle-swarm":
      return 20;
  }
}

export function isBossEvent(kind: NightEventKind): kind is BossId {
  return kind === "bat" || kind === "wasp";
}

/**
 * One night's authored chaos. Aurora is never announced.
 * Bosses and infestations carry a visor timer.
 */
export function composeEvents(night: number, rng: () => number): EventPlan[] {
  const n = Math.max(1, Math.floor(night));
  const plans: EventPlan[] = [];

  const auroraAt = 18 + rng() * 40;
  plans.push(plan("aurora", auroraAt, rng));
  if (n >= 4 && rng() < 0.45) {
    plans.push(plan("aurora", auroraAt + 50 + rng() * 30, rng));
  }

  plans.push(plan("bat", 55 + rng() * 18 + n * 4, rng));
  if (n >= 3) plans.push(plan("wasp", 95 + rng() * 22 + n * 5, rng));
  else if (n >= 2 && rng() < 0.4) plans.push(plan("wasp", 120 + rng() * 20, rng));

  if (n >= 2) {
    const kind: NightEventKind = rng() < 0.45 ? "beetle-swarm" : "mite-swarm";
    plans.push(plan(kind, 32 + rng() * 28, rng));
  }
  if (n >= 5 && rng() < 0.55) {
    plans.push(plan("mite-swarm", 80 + rng() * 25, rng));
  }

  plans.sort((a, b) => a.at - b.at);
  return plans;
}

function plan(kind: NightEventKind, at: number, rng: () => number): EventPlan {
  const duration = eventDuration(kind) * (0.9 + rng() * 0.2);
  const silent = kind === "aurora";
  return {
    kind,
    at,
    duration,
    alert: !silent,
    trackable: kind !== "aurora",
    title: eventTitle(kind),
    line: eventLine(kind),
  };
}

export function auroraScoreMul(active: boolean): number {
  return active ? 1.25 : 1;
}
