/**
 * Time-of-day library voice + a stable hourly "left on the cart" pick.
 * Client-local clock only — never server TZ.
 */

export type LibraryPhase = "dawn" | "day" | "dusk" | "night";

export type LibraryHours = {
  phase: LibraryPhase;
  /** Quiet circulation-desk line. */
  line: string;
  slipLabel: string;
};

export type CartHolding = {
  id: number;
  title: string;
  kind: string;
};

export function libraryHours(now: Date = new Date()): LibraryHours {
  const h = now.getHours();
  if (h < 6) {
    return {
      phase: "night",
      line: "Night desk. The stacks are yours.",
      slipLabel: "Left on the night cart",
    };
  }
  if (h < 11) {
    return {
      phase: "dawn",
      line: "Early hours. The reading lamps are on.",
      slipLabel: "Left on the cart",
    };
  }
  if (h < 17) {
    return {
      phase: "day",
      line: "Open stacks. One pull from this hour’s cart.",
      slipLabel: "On the reading table",
    };
  }
  if (h < 21) {
    return {
      phase: "dusk",
      line: "Evening reading. One last pull from the cart.",
      slipLabel: "Evening hold",
    };
  }
  return {
    phase: "night",
    line: "After hours. Keep the lamp low.",
    slipLabel: "Left on the night cart",
  };
}

/** Stable pick for this calendar hour so the slip doesn’t flicker. */
export function pickCartItem<T>(items: readonly T[], now: Date = new Date()): T | null {
  if (items.length === 0) return null;
  const key = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return items[Math.abs(h) % items.length] ?? null;
}
