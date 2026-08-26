import type { Metadata } from "next";
import { NightMothGame } from "@/components/arcade/night-moth/NightMothGame";
import { NIGHT_MOTH_GAME_ID } from "@/lib/arcade/night-moth";
import { getProgress, listScores } from "@/lib/arcade/scores";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Night Moth",
  description:
    "3D voxel night flight. Judge every lamp. Some are Circulation. Some are cages.",
};

export default function NightMothPage() {
  const scores = listScores(NIGHT_MOTH_GAME_ID);
  const progress = getProgress(NIGHT_MOTH_GAME_ID);
  return (
    <NightMothGame initialScores={scores} initialProgress={progress} />
  );
}
