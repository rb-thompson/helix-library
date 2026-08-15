import { NextResponse } from "next/server";
import {
  assertRestoreHttpCaller,
  RestoreHttpError,
  restoreHttpFailure,
} from "@/lib/backup/http";
import { inspectBackup } from "@/lib/backup/inspect";
import {
  RESTORE_SIDECAR_KEEP_MS,
  clearRestoreProgress,
  readRestoreProgress,
  type RestoreSidecar,
} from "@/lib/backup/progress";
import {
  applyRestore,
  assertRestoreApplyAvailable,
  restoreApplyAllowed,
  type RestoreLocationActionSpec,
} from "@/lib/backup/restore";
import { consumeRestoreSession } from "@/lib/backup/session";
import type { RestoreLocationAction } from "@/lib/backup/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const LOCATION_ACTIONS = new Set<RestoreLocationAction>([
  "keep-live",
  "use-archived",
  "disable",
  "remap",
]);

/** Test-only. Cleared by tests after use. */
export const restoreApplyHttpHooks: {
  afterInspect?: () => void;
} = {};

type RestoreApplyBody = {
  name: string;
  confirmToken: string;
  /** undefined = default on if the archive has thumbs. */
  includeThumbs?: boolean;
  applyLocationRoots: boolean;
  locationActions?: RestoreLocationActionSpec[];
};

function parseApplyBody(raw: unknown): RestoreApplyBody {
  const body = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  if (typeof body.name !== "string" || !body.name.trim()) {
    throw new RestoreHttpError("name is required", 400);
  }
  if (typeof body.confirmToken !== "string" || !body.confirmToken) {
    throw new RestoreHttpError("confirmToken is required", 400);
  }
  if (body.phrase !== "RESTORE") {
    throw new RestoreHttpError("phrase must be RESTORE", 400);
  }
  if (body.acknowledge !== true) {
    throw new RestoreHttpError("acknowledge is required", 400);
  }
  if (
    body.includeThumbs !== undefined &&
    typeof body.includeThumbs !== "boolean"
  ) {
    throw new RestoreHttpError("includeThumbs must be a boolean", 400);
  }
  if (
    body.applyLocationRoots !== undefined &&
    typeof body.applyLocationRoots !== "boolean"
  ) {
    throw new RestoreHttpError("applyLocationRoots must be a boolean", 400);
  }
  return {
    name: body.name.trim(),
    confirmToken: body.confirmToken,
    includeThumbs:
      body.includeThumbs === undefined ? undefined : body.includeThumbs,
    applyLocationRoots: Boolean(body.applyLocationRoots),
    locationActions: parseLocationActions(body.locationActions),
  };
}

function parseLocationActions(
  raw: unknown,
): RestoreLocationActionSpec[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw)) {
    throw new RestoreHttpError("locationActions must be an array", 400);
  }
  return raw.map((row, i) => {
    if (!row || typeof row !== "object") {
      throw new RestoreHttpError(`locationActions[${i}] is invalid`, 400);
    }
    const o = row as Record<string, unknown>;
    if (typeof o.name !== "string" || !o.name) {
      throw new RestoreHttpError(`locationActions[${i}].name is required`, 400);
    }
    if (
      typeof o.action !== "string" ||
      !LOCATION_ACTIONS.has(o.action as RestoreLocationAction)
    ) {
      throw new RestoreHttpError(`locationActions[${i}].action is invalid`, 400);
    }
    const spec: RestoreLocationActionSpec = {
      name: o.name,
      action: o.action as RestoreLocationAction,
    };
    if (o.remapTo !== undefined) {
      if (typeof o.remapTo !== "string") {
        throw new RestoreHttpError(
          `locationActions[${i}].remapTo is invalid`,
          400,
        );
      }
      spec.remapTo = o.remapTo;
    }
    return spec;
  });
}

function restoreGetEnvelope():
  | { ok: true; active: false }
  | ({ ok: true; active: true } & RestoreSidecar) {
  const sidecar = readRestoreProgress();
  if (!sidecar) return { ok: true, active: false };

  if (sidecar.status === "pending" || sidecar.status === "running") {
    return { ok: true, active: true, ...sidecar };
  }

  const end = sidecar.finishedAt ?? sidecar.createdAt;
  if (Date.now() - end > RESTORE_SIDECAR_KEEP_MS) {
    clearRestoreProgress();
    return { ok: true, active: false };
  }
  return { ok: true, active: true, ...sidecar };
}

/** GET /api/restore — sidecar only. Do not open SQLite. */
export async function GET(req: Request) {
  try {
    assertRestoreHttpCaller(req);
    return NextResponse.json(restoreGetEnvelope());
  } catch (err) {
    const { body, status } = restoreHttpFailure(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/restore — apply a snapshot. Synchronous until COMMIT.
 * Does not pre-set sidecar running; applyRestore claims it.
 */
export async function POST(req: Request) {
  try {
    assertRestoreHttpCaller(req);
    if (!restoreApplyAllowed()) {
      throw new RestoreHttpError("Restore is disabled (NON_OS_RESTORE=0)", 403);
    }

    const body = parseApplyBody(await req.json().catch(() => ({})));

    // Inspect first (read-only). Yields here; do not consume until after.
    const preview = await inspectBackup(body.name);
    restoreApplyHttpHooks.afterInspect?.();

    // Default thumbs on only if the archive actually has them (skip, not 400).
    const includeThumbs =
      (body.includeThumbs === undefined ? true : body.includeThumbs) &&
      preview.hasThumbs;

    // Busy + consume + apply with no await between check and consume.
    assertRestoreApplyAvailable();
    consumeRestoreSession({
      token: body.confirmToken,
      name: preview.name,
      previewHash: preview.previewHash,
    });

    const result = await applyRestore({
      name: preview.name,
      includeThumbs,
      applyLocationRoots: body.applyLocationRoots,
      locationActions: body.locationActions,
    });

    return NextResponse.json({
      ok: true,
      async: false,
      result: {
        undoBackup: result.undoBackup,
        appliedThumbs: result.appliedThumbs,
        remapped: result.remapped,
        itemCount: result.itemCount,
        jobId: result.jobId,
        ...(result.partial ? { partial: true } : {}),
        ...(result.error ? { error: result.error } : {}),
      },
    });
  } catch (err) {
    const { body, status } = restoreHttpFailure(err);
    return NextResponse.json(body, { status });
  }
}
