import Link from "next/link";
import { ArcadeCabinet } from "@/components/arcade/ArcadeCabinet";
import type { ArcadeScore } from "@/lib/arcade/scores";

export function NightMothArcadeCard({
  scores,
  best,
}: {
  scores: ArcadeScore[];
  best?: number;
}) {
  const top = scores.slice(0, 5);
  return (
    <Link href="/arcade/night-moth" className="nm-feature">
      <div className="nm-feature-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arcade/night-moth/jacket.jpg"
          alt="Night Moth — after-hours flight. Not every lamp is Circulation."
          className="nm-feature-jacket"
        />
        <div className="nm-feature-spine">
          <p className="nm-feature-kicker">Helix Arcade</p>
          <h2 className="nm-feature-title">Night Moth</h2>
          <p className="nm-feature-tag">
            Not every lamp is Circulation. Fly. Judge. Drink. Dust.
          </p>
        </div>
      </div>
      <ArcadeCabinet
        scores={top}
        highlight={best}
        marquee={["NOW PLAYING", "NIGHT MOTH", "INSERT WING"]}
      />
    </Link>
  );
}
