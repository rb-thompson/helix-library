import { NightMothArcadeCard } from "@/components/arcade/NightMothArcadeCard";
import { PageHeader } from "@/components/ui/PageHeader";
import type { ArcadeProgress, ArcadeScore } from "@/lib/arcade/scores";
import { nextUnlock } from "@/lib/arcade/night-moth";

export function ArcadeDesk({
  scores,
  progress,
}: {
  scores: ArcadeScore[];
  progress: ArcadeProgress;
}) {
  const next = nextUnlock(progress.xp);
  return (
    <div className="space-y-6 sm:space-y-8">
      <PageHeader
        register="desk"
        eyebrow="After hours"
        title="Arcade"
        description="The stacks close. The garden does not. A small cabinet of games that belong to this building — not a carnival, not a mascot dance. Lamps, moths, and whatever the grounds keep after Circulation."
      />

      <div className="grid items-start gap-6 sm:grid-cols-[minmax(0,14rem)_1fr]">
        <NightMothArcadeCard scores={scores} best={scores[0]?.score} />
        <p className="max-w-sm pt-1 text-xs text-[var(--muted-faint)]">
          Lifetime XP {progress.xp}
          {next ? ` · ${next.remaining} to unlock ${next.name}` : " · all arts open"}
        </p>
      </div>
    </div>
  );
}
