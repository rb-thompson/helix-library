"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  libraryHours,
  pickCartItem,
  type CartHolding,
  type LibraryHours,
} from "@/lib/client/library-hours";

/**
 * Quiet circulation desk: time-of-day line + one holding left on the cart.
 */
export function HoursDesk({ holdings }: { holdings: CartHolding[] }) {
  const [hours, setHours] = useState<LibraryHours>(() => libraryHours());
  const [item, setItem] = useState<CartHolding | null>(null);

  useEffect(() => {
    const now = new Date();
    const next = libraryHours(now);
    setHours(next);
    setItem(pickCartItem(holdings, now));
    document.querySelector(".hero-frame")?.classList.toggle(
      "hero-dawn",
      next.phase === "dawn",
    );
    return () => {
      document.querySelector(".hero-frame")?.classList.remove("hero-dawn");
    };
  }, [holdings]);

  if (!item) {
    return (
      <p className="mt-4 max-w-xl text-sm text-[var(--muted)]">{hours.line}</p>
    );
  }

  return (
    <Link
      href={`/catalog/${item.id}`}
      className="due-slip mt-5 max-w-xl no-underline"
      title="A holding the night clerk left out"
    >
      <span className="due-slip-kicker">{hours.slipLabel}</span>
      <span className="due-slip-title">{item.title}</span>
      <span className="due-slip-line">{hours.line}</span>
      <span className="due-slip-stamp">Due never</span>
    </Link>
  );
}
