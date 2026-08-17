import { NextResponse } from "next/server";
import {
  HIGH_SCORE_LIMIT,
  NIGHT_MOTH_GAME_ID,
} from "@/lib/arcade/night-moth";
import {
  isArcadeGameId,
  listScores,
  submitScore,
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
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : HIGH_SCORE_LIMIT;
  return NextResponse.json({
    ok: true,
    game: raw,
    scores: listScores(raw, limit),
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      game?: unknown;
      score?: unknown;
      night?: unknown;
      nectar?: unknown;
      durationMs?: unknown;
      abilities?: unknown;
      initials?: unknown;
    };
    const game = (body.game ?? NIGHT_MOTH_GAME_ID) as ArcadeGameId;
    if (!isArcadeGameId(game)) {
      return NextResponse.json({ ok: false, error: "unknown game" }, { status: 400 });
    }
    if (typeof body.score !== "number" || !Number.isFinite(body.score)) {
      return NextResponse.json({ ok: false, error: "score is required" }, { status: 400 });
    }
    const row = submitScore({
      game,
      score: body.score,
      night: typeof body.night === "number" ? body.night : 1,
      nectar: typeof body.nectar === "number" ? body.nectar : 0,
      durationMs: typeof body.durationMs === "number" ? body.durationMs : 0,
      abilities: body.abilities,
      initials: body.initials,
    });
    return NextResponse.json({
      ok: true,
      score: row,
      scores: listScores(game),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
