import type { Metadata } from "next";
import { ArcadeDesk } from "@/components/arcade/ArcadeDesk";
import { NIGHT_MOTH_GAME_ID } from "@/lib/arcade/night-moth";
import { getProgress, listScores } from "@/lib/arcade/scores";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Arcade",
  description:
    "After-hours games on the Helix grounds. Night Moth — not every lamp is kind.",
};

export default function ArcadePage() {
  const scores = listScores(NIGHT_MOTH_GAME_ID, 5);
  const progress = getProgress(NIGHT_MOTH_GAME_ID);
  return <ArcadeDesk scores={scores} progress={progress} />;
}
