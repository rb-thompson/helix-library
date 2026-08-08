import { NextResponse } from "next/server";
import { createBackup } from "@/lib/backup/create";
import { listBackups } from "@/lib/backup/list";
import type { BackupMode } from "@/lib/backup/types";
import {
  createJob,
  isKindBusy,
  runHelixJob,
  serializeHelixJob,
} from "@/lib/jobs/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

/** List backup archives under data/exports/. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    backups: listBackups().map((b) => ({
      name: b.name,
      bytes: b.bytes,
      mtimeMs: b.mtimeMs,
      mode: b.mode,
    })),
  });
}

/**
 * Start a backup job (async). Poll /api/jobs/:id for progress.
 * Body: { mode: "catalog" | "full", includeThumbs?: boolean }
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      mode?: string;
      includeThumbs?: boolean;
    };
    if (body.mode && body.mode !== "catalog" && body.mode !== "full") {
      return NextResponse.json(
        { ok: false, error: "mode must be catalog or full" },
        { status: 400 },
      );
    }
    const mode: BackupMode = body.mode === "full" ? "full" : "catalog";

    if (isKindBusy("backup")) {
      return NextResponse.json(
        {
          ok: false,
          error: "A backup is already running. Wait for it to finish.",
        },
        { status: 409 },
      );
    }

    const includeThumbs =
      body.includeThumbs === undefined ? true : Boolean(body.includeThumbs);

    const job = createJob({
      kind: "backup",
      label: `Backup (${mode})`,
    });

    void runHelixJob(job.id, async (report) => {
      const result = await createBackup({
        mode,
        includeThumbs,
        jobId: job.id,
        onProgress: report,
      });
      return {
        name: result.name,
        path: result.path,
        bytes: result.bytes,
        mode: result.mode,
        includes: result.manifest.includes,
      };
    });

    return NextResponse.json({
      ok: true,
      async: true,
      jobId: job.id,
      job: serializeHelixJob(job),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
