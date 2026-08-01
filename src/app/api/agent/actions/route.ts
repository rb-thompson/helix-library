import { NextResponse } from "next/server";
import {
  executeLibrarianAction,
  executeLibrarianActions,
  parseLegacyPropose,
  type LibrarianAction,
} from "@/lib/agent/actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Execute confirmed librarian action(s).
 * Body: { action } | { actions: [] } | { legacy: "tag item=1 name=x" }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: LibrarianAction;
      actions?: LibrarianAction[];
      legacy?: string;
    };

    if (body.legacy) {
      const parsed = parseLegacyPropose(body.legacy);
      if (!parsed) {
        return NextResponse.json(
          { ok: false, error: `Unknown proposal: ${body.legacy}` },
          { status: 400 },
        );
      }
      const result = executeLibrarianAction(parsed);
      return NextResponse.json({
        ok: result.ok,
        results: [result],
        message: result.message,
      });
    }

    if (body.action) {
      const result = executeLibrarianAction(body.action);
      return NextResponse.json({
        ok: result.ok,
        results: [result],
        message: result.message,
        data: result.data,
      });
    }

    if (Array.isArray(body.actions) && body.actions.length > 0) {
      if (body.actions.length > 50) {
        return NextResponse.json(
          { ok: false, error: "At most 50 actions per request" },
          { status: 400 },
        );
      }
      const results = executeLibrarianActions(body.actions);
      const ok = results.every((r) => r.ok);
      return NextResponse.json({
        ok,
        results,
        message: results.map((r) => r.message).join(" · "),
      });
    }

    return NextResponse.json(
      { ok: false, error: "action, actions[], or legacy required" },
      { status: 400 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
