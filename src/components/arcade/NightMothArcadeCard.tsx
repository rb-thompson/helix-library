import Link from "next/link";
import { Orbitron } from "next/font/google";
import type { ArcadeScore } from "@/lib/arcade/scores";
import { cn } from "@/lib/cn";

const jacketType = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700"],
});

export function NightMothArcadeCard({
  scores,
  best,
  className,
}: {
  scores: ArcadeScore[];
  best?: number;
  className?: string;
}) {
  const top = best ?? scores[0]?.score;
  return (
    <Link href="/arcade/night-moth" className={cn("nm-dash-card", className)}>
      <span className="nm-dash-card__art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arcade/night-moth/jacket.jpg"
          alt=""
          className="nm-dash-card__jacket"
        />
        <span className={`${jacketType.className} nm-dash-card__mark`}>
          NIGHT MOTH
        </span>
      </span>
      <span className="nm-dash-card__copy">
        <span className="eyebrow">Arcade</span>
        <span className={`${jacketType.className} nm-dash-card__title`}>
          Night Moth
        </span>
        <span className="nm-dash-card__tag">
          Not every lamp is Circulation.
        </span>
        {top != null ? (
          <span className="chip chip-stat nm-dash-card__chip">
            <span className="chip-label">Best</span>
            <span className="chip-value">{top.toLocaleString()}</span>
          </span>
        ) : (
          <span className="nm-dash-card__go">Play →</span>
        )}
      </span>
    </Link>
  );
}
