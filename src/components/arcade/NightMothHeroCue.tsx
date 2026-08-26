import Link from "next/link";
import { Orbitron } from "next/font/google";

const jacketType = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700"],
});

/** Quiet after-hours cue — atmosphere in the hero, not a dash card. */
export function NightMothHeroCue() {
  return (
    <>
      <Link
        href="/arcade/night-moth"
        className="nm-hero-now"
        title="Night Moth — after hours in the garden"
      >
        After hours · Night Moth
      </Link>
      <Link
        href="/arcade/night-moth"
        className="nm-hero-cue"
        aria-label="Play Night Moth"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/arcade/night-moth/jacket.jpg"
          alt=""
          className="nm-hero-cue__art"
        />
        <span className={`${jacketType.className} nm-hero-cue__copy`}>
          <span className="nm-hero-cue__kicker">After hours</span>
          <span className="nm-hero-cue__title">Night Moth</span>
        </span>
      </Link>
    </>
  );
}
