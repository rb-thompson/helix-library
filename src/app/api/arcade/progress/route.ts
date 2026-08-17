import { NextResponse } from "next/server";
import { NIGHT_MOTH_GAME_ID } from "@/lib/arcade/night-moth";
import {
  getProgress,
  isArcadeGameId,
  saveProgress,
  type ArcadeGameId,
} from "@/lib/arcade/scores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("game") ?? NIGHT_MOTH_GAME_ID;
  if (!isArcadeGameId(raw)) {
    return NextResponse.json({ ok: false, error: "unknown game" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, progress: getProgress(raw) });
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      game?: unknown;
      xp?: unknown;
      unlocked?: unknown;
      tutorialDone?: unknown;
    };
    const game = (body.game ?? NIGHT_MOTH_GAME_ID) as ArcadeGameId;
    if (!isArcadeGameId(game)) {
      return NextResponse.json({ ok: false, error: "unknown game" }, { status: 400 });
    }
    if (typeof body.xp !== "number" || !Number.isFinite(body.xp)) {
      return NextResponse.json({ ok: false, error: "xp is required" }, { status: 400 });
    }
    const progress = saveProgress({
      game,
      xp: body.xp,
      unlocked: body.unlocked,
      tutorialDone: Boolean(body.tutorialDone),
    });
    return NextResponse.json({ ok: true, progress });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
