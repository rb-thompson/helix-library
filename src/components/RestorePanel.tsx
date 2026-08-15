"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, RotateCcw, X } from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { ReindexButton } from "@/components/ReindexButton";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/lib/cn";
import { formatBytes, formatDate } from "@/lib/format";
import type {
  RestoreLiveStats,
  RestoreLocationAction,
  RestorePreview,
} from "@/lib/backup/types";

export const RESTORE_SELECT_EVENT = "helix-restore-select";

const HOLDINGS_TIP =
  "Not in this version. Holdings stay on disk; only the catalog is returned.";

const ACK_LABEL =
  "I understand this replaces the live catalog and cannot be undone except via the automatic pre-restore snapshot.";

type BackupRow = {
  name: string;
  bytes: number;
  mtimeMs: number;
  mode: string;
};

type LocationDraft = {
  name: string;
  action: RestoreLocationAction;
  remapTo: string;
};

type SidecarView = {
  status: string;
  archiveName: string;
  error: string | null;
  progress: { stage: string; percent: number | null; detail?: string };
  result: {
    undoBackup?: string;
    appliedThumbs?: boolean;
    remapped?: boolean;
    itemCount?: number;
    partial?: boolean;
  } | null;
};

type SuccessView = {
  name: string;
  undoBackup: string;
  itemCount?: number;
  appliedThumbs?: boolean;
  remapped?: boolean;
  partial?: boolean;
  error?: string | null;
  missingRoots: string[];
};

const LOCATION_ACTIONS: Array<{
  value: RestoreLocationAction;
  label: string;
}> = [
  { value: "keep-live", label: "Keep live" },
  { value: "use-archived", label: "Use archived" },
  { value: "disable", label: "Disable" },
  { value: "remap", label: "Remap…" },
];

/** Scroll to the restore desk and (re)inspect this archive. */
export function requestRestore(name: string): void {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("restore", name);
  url.hash = "restore-panel";
  window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  window.dispatchEvent(
    new CustomEvent(RESTORE_SELECT_EVENT, { detail: name }),
  );
  document.getElementById("restore-panel")?.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

export function RestorePanel() {
  const router = useRouter();
  const inspectGen = useRef(0);
  const applyingRef = useRef(false);

  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [selectedName, setSelectedName] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  const [preview, setPreview] = useState<RestorePreview | null>(null);
  const [live, setLive] = useState<RestoreLiveStats | null>(null);
  const [confirmToken, setConfirmToken] = useState<string | null>(null);

  const [includeThumbs, setIncludeThumbs] = useState(false);
  const [applyLocationRoots, setApplyLocationRoots] = useState(false);
  const [locationActions, setLocationActions] = useState<LocationDraft[]>([]);
  const [acknowledge, setAcknowledge] = useState(false);
  const [phrase, setPhrase] = useState("");

  const [sidecar, setSidecar] = useState<SidecarView | null>(null);
  const [success, setSuccess] = useState<SuccessView | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const refreshBackups = useCallback(async () => {
    try {
      const res = await fetch("/api/backup", { cache: "no-store" });
      const data = await res.json();
      if (data.ok && Array.isArray(data.backups)) {
        setBackups(data.backups as BackupRow[]);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const readSidecar = useCallback(async (): Promise<SidecarView | null> => {
    const res = await fetch("/api/restore", { cache: "no-store" });
    const data = (await res.json()) as {
      ok?: boolean;
      active?: boolean;
      error?: string;
      status?: string;
      archiveName?: string;
      progress?: SidecarView["progress"];
      result?: SidecarView["result"];
    };
    if (res.status === 403) {
      setGateError(data.error ?? "Restore is not available from this connection.");
      return null;
    }
    if (!res.ok || !data.ok || !data.active) return null;
    return {
      status: data.status ?? "unknown",
      archiveName: data.archiveName ?? "",
      error: typeof data.error === "string" ? data.error : null,
      progress: data.progress ?? { stage: "queued", percent: 0 },
      result: data.result ?? null,
    };
  }, []);

  const inspectArchive = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed || applyingRef.current) return;
    const gen = ++inspectGen.current;
    setInspecting(true);
    setError(null);
    setSuccess(null);
    setBannerDismissed(false);
    setSelectedName(trimmed);
    try {
      const res = await fetch("/api/restore/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (gen !== inspectGen.current) return;
      if (res.status === 403) {
        setGateError(data.error ?? "Restore is not available from this connection.");
        return;
      }
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Inspect failed");
        setPreview(null);
        setConfirmToken(null);
        return;
      }
      const next = data.preview as RestorePreview;
      setPreview(next);
      setLive((data.live as RestoreLiveStats) ?? null);
      setConfirmToken(
        typeof data.confirmToken === "string" ? data.confirmToken : null,
      );
      setIncludeThumbs(Boolean(next.hasThumbs));
      setApplyLocationRoots(false);
      setLocationActions(
        next.locations.map((loc) => ({
          name: loc.name,
          action: loc.defaultAction,
          remapTo: "",
        })),
      );
      setAcknowledge(false);
      setPhrase("");
    } catch (e) {
      if (gen !== inspectGen.current) return;
      setError(e instanceof Error ? e.message : "Inspect failed");
      setPreview(null);
      setConfirmToken(null);
    } finally {
      if (gen === inspectGen.current) setInspecting(false);
    }
  }, []);

  useEffect(() => {
    applyingRef.current = applying;
  }, [applying]);

  useEffect(() => {
    void refreshBackups();
  }, [refreshBackups]);

  useEffect(() => {
    function onSelect(e: Event) {
      const name = (e as CustomEvent<string>).detail;
      if (typeof name === "string" && name) void inspectArchive(name);
    }
    window.addEventListener(RESTORE_SELECT_EVENT, onSelect);

    let cancelled = false;
    void (async () => {
      let snap: SidecarView | null = null;
      try {
        snap = await readSidecar();
      } catch {
        /* sidecar optional */
      }
      if (cancelled) return;
      if (snap && (snap.status === "running" || snap.status === "pending")) {
        setApplying(true);
        setSidecar(snap);
        return;
      }
      const q = new URLSearchParams(window.location.search).get("restore");
      if (q) {
        void inspectArchive(q);
        return;
      }
      if (snap?.status === "completed" && snap.result?.undoBackup) {
        setSuccess({
          name: snap.archiveName,
          undoBackup: snap.result.undoBackup,
          itemCount: snap.result.itemCount,
          appliedThumbs: snap.result.appliedThumbs,
          remapped: snap.result.remapped,
          partial: snap.result.partial,
          error: snap.error,
          missingRoots: [],
        });
        return;
      }
      if (snap?.status === "failed") {
        setError(snap.error ?? "Restore failed");
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener(RESTORE_SELECT_EVENT, onSelect);
    };
  }, [inspectArchive, readSidecar]);

  useEffect(() => {
    if (!applying) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const snap = await readSidecar();
        if (cancelled || !snap) return;
        setSidecar(snap);
        if (
          snap.status === "completed" ||
          snap.status === "failed" ||
          snap.status === "cancelled"
        ) {
          setApplying(false);
        }
      } catch {
        /* keep waiting on the apply POST */
      }
    };
    void tick();
    const t = setInterval(() => {
      void tick();
    }, 400);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [applying, readSidecar]);

  const missingRoots = useMemo(() => {
    if (!preview) return [];
    return preview.locations
      .filter((loc) => {
        if (!applyLocationRoots) {
          return Boolean(loc.liveRoot) && !loc.liveExists;
        }
        const draft =
          locationActions.find((a) => a.name === loc.name)?.action ??
          loc.defaultAction;
        if (draft === "disable") return false;
        if (draft === "use-archived") return !loc.archivedRootExists;
        if (draft === "keep-live") return !loc.liveExists;
        return false;
      })
      .map((loc) => loc.name);
  }, [applyLocationRoots, locationActions, preview]);

  const canApply =
    Boolean(preview && confirmToken) &&
    acknowledge &&
    phrase === "RESTORE" &&
    !applying &&
    !inspecting;

  async function cancelPreview() {
    setError(null);
    try {
      await fetch("/api/restore/session", { method: "DELETE" });
    } catch {
      /* token expires anyway */
    }
    inspectGen.current += 1;
    setPreview(null);
    setLive(null);
    setConfirmToken(null);
    setAcknowledge(false);
    setPhrase("");
    setApplyLocationRoots(false);
    setLocationActions([]);
  }

  async function apply() {
    if (!preview || !confirmToken || !canApply) return;
    applyingRef.current = true;
    setApplying(true);
    setError(null);
    setSuccess(null);
    setBannerDismissed(false);
    try {
      const res = await fetch("/api/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: preview.name,
          confirmToken,
          phrase,
          acknowledge: true,
          includeThumbs,
          applyLocationRoots,
          locationActions: applyLocationRoots
            ? locationActions.map((row) => ({
                name: row.name,
                action: row.action,
                ...(row.action === "remap" && row.remapTo.trim()
                  ? { remapTo: row.remapTo.trim() }
                  : {}),
              }))
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Restore failed");
        setConfirmToken(null);
        setPhrase("");
        setAcknowledge(false);
        applyingRef.current = false;
        setApplying(false);
        // Token is single-use — remint so retry is possible.
        void inspectArchive(preview.name);
        return;
      }
      const result = (data.result ?? {}) as SuccessView;
      setSuccess({
        name: preview.name,
        undoBackup: typeof result.undoBackup === "string" ? result.undoBackup : "",
        itemCount: result.itemCount,
        appliedThumbs: result.appliedThumbs,
        remapped: result.remapped,
        partial: result.partial,
        error: result.error,
        missingRoots,
      });
      setPreview(null);
      setLive(null);
      setConfirmToken(null);
      setAcknowledge(false);
      setPhrase("");
      setSidecar(null);
      await refreshBackups();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
      setConfirmToken(null);
      setPhrase("");
      setAcknowledge(false);
      applyingRef.current = false;
      setApplying(false);
      if (preview) void inspectArchive(preview.name);
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  function updateAction(name: string, action: RestoreLocationAction) {
    setLocationActions((prev) =>
      prev.map((row) => (row.name === name ? { ...row, action } : row)),
    );
  }

  function updateRemapTo(name: string, remapTo: string) {
    setLocationActions((prev) =>
      prev.map((row) => (row.name === name ? { ...row, remapTo } : row)),
    );
  }

  const busy = inspecting || applying;
  const progress = sidecar?.progress ?? null;

  return (
    <section id="restore-panel" className="surface p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
            Restore from snapshot
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Return a catalog snapshot from{" "}
            <code className="code-inline">data/exports/</code> over the live
            catalog. This overwrites catalog rows in{" "}
            <code className="code-inline">library.db</code> (the file stays in
            place). Helix first writes an undo snapshot. Holdings files are not
            overwritten.
          </p>
        </div>
      </div>

      {gateError ? (
        <p className="mt-3 text-xs text-[var(--danger)]" role="alert">
          {gateError}
        </p>
      ) : null}

      {success ? (
        <SuccessCard
          success={success}
          bannerDismissed={bannerDismissed}
          onDismissBanner={() => setBannerDismissed(true)}
          onAnother={() => {
            setSuccess(null);
            setBannerDismissed(false);
            setError(null);
            setSidecar(null);
          }}
        />
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="min-w-0 flex-1">
              <span className="label-quiet">Local snapshot</span>
              <select
                className="field font-mono text-xs"
                value={selectedName}
                disabled={busy || backups.length === 0}
                onChange={(e) => setSelectedName(e.target.value)}
              >
                <option value="">
                  {backups.length === 0
                    ? "No backups yet"
                    : "Choose an archive…"}
                </option>
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({formatBytes(b.bytes)})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary min-h-11"
              disabled={busy || !selectedName}
              onClick={() => void inspectArchive(selectedName)}
            >
              {inspecting ? (
                <HelixSpinner size="md" decorative />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              Inspect
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--muted-faint)]">
            Inspect is read-only. Apply requires typing{" "}
            <code className="code-inline">RESTORE</code>. CLI:{" "}
            <code className="code-inline">npm run restore</code>
          </p>

          {progress && applying ? (
            <ProgressBlock progress={progress} />
          ) : null}

          {preview ? (
            <PreviewForm
              preview={preview}
              live={live}
              includeThumbs={includeThumbs}
              applyLocationRoots={applyLocationRoots}
              locationActions={locationActions}
              acknowledge={acknowledge}
              phrase={phrase}
              canApply={canApply}
              busy={busy}
              applying={applying}
              onIncludeThumbs={setIncludeThumbs}
              onApplyLocationRoots={setApplyLocationRoots}
              onAction={updateAction}
              onRemapTo={updateRemapTo}
              onAcknowledge={setAcknowledge}
              onPhrase={setPhrase}
              onApply={() => void apply()}
              onCancel={() => void cancelPreview()}
            />
          ) : null}
        </>
      )}

      {error ? (
        <p className="mt-3 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}

function ProgressBlock({
  progress,
}: {
  progress: { stage: string; percent: number | null; detail?: string };
}) {
  return (
    <div
      className="mt-3 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] px-3 py-2.5"
      role="status"
    >
      <div className="flex justify-between text-xs">
        <span className="font-medium capitalize text-[var(--ink)]">
          {progress.stage.replace(/_/g, " ")}
        </span>
        <span className="tabular-nums text-[var(--muted)]">
          {progress.percent == null ? "…" : `${Math.round(progress.percent)}%`}
        </span>
      </div>
      {progress.percent != null ? (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--ok)_18%,var(--paper-deep))]">
          <div
            className="h-full rounded-full bg-[var(--ok)] transition-[width]"
            style={{
              width: `${Math.max(2, Math.min(100, progress.percent))}%`,
            }}
          />
        </div>
      ) : null}
      {progress.detail ? (
        <p className="mt-1.5 font-mono text-[0.65rem] text-[var(--muted)]">
          {progress.detail}
        </p>
      ) : null}
    </div>
  );
}

function PreviewForm({
  preview,
  live,
  includeThumbs,
  applyLocationRoots,
  locationActions,
  acknowledge,
  phrase,
  canApply,
  busy,
  applying,
  onIncludeThumbs,
  onApplyLocationRoots,
  onAction,
  onRemapTo,
  onAcknowledge,
  onPhrase,
  onApply,
  onCancel,
}: {
  preview: RestorePreview;
  live: RestoreLiveStats | null;
  includeThumbs: boolean;
  applyLocationRoots: boolean;
  locationActions: LocationDraft[];
  acknowledge: boolean;
  phrase: string;
  canApply: boolean;
  busy: boolean;
  applying: boolean;
  onIncludeThumbs: (v: boolean) => void;
  onApplyLocationRoots: (v: boolean) => void;
  onAction: (name: string, action: RestoreLocationAction) => void;
  onRemapTo: (name: string, remapTo: string) => void;
  onAcknowledge: (v: boolean) => void;
  onPhrase: (v: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const createdMs = Date.parse(preview.createdAt);

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase",
              preview.mode === "full"
                ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                : "bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]",
            )}
          >
            {preview.mode}
          </span>
          <span className="font-mono text-xs text-[var(--ink)]">
            {preview.name}
          </span>
        </div>
        <p className="mt-1.5 text-[0.7rem] text-[var(--muted)]">
          {Number.isFinite(createdMs) ? formatDate(createdMs) : preview.createdAt}{" "}
          · {formatBytes(preview.bytes)}
          {preview.hostname ? ` · ${preview.hostname}` : ""}
        </p>
        {preview.hostnameMismatch ? (
          <p className="mt-1.5 inline-flex items-start gap-1.5 text-xs text-[var(--warn)]">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            Snapshot host {preview.hostname ?? "unknown"} does not match this
            machine ({preview.thisHostname}).
          </p>
        ) : null}
        {preview.warnings.length > 0 ? (
          <ul className="mt-2 space-y-1 text-xs text-[var(--warn)]">
            {preview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}
        {live ? (
          <p className="mt-2 text-xs text-[var(--ink-soft)]">
            This will replace the live catalog ({live.itemCount} items,{" "}
            <code className="code-inline">{live.dbPath}</code>
            {live.dbBytes ? ` · ${formatBytes(live.dbBytes)}` : ""}).
          </p>
        ) : null}
      </div>

      <LocationTable
        preview={preview}
        applyLocationRoots={applyLocationRoots}
        locationActions={locationActions}
        disabled={busy}
        onAction={onAction}
        onRemapTo={onRemapTo}
      />

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-[var(--line)]"
            checked
            disabled
            readOnly
          />
          <span>
            Replace live catalog (<code className="code-inline">library.db</code>
            )
            <span className="ml-1.5 text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--muted)]">
              required
            </span>
          </span>
        </label>

        <label
          className={cn(
            "flex items-start gap-2 text-sm text-[var(--ink-soft)]",
            !preview.hasThumbs && "opacity-60",
          )}
        >
          <input
            type="checkbox"
            className="mt-0.5 rounded border-[var(--line)]"
            checked={includeThumbs}
            disabled={busy || !preview.hasThumbs}
            onChange={(e) => onIncludeThumbs(e.target.checked)}
          />
          <span>
            Replace thumbs
            {!preview.hasThumbs ? (
              <span className="ml-1.5 text-xs text-[var(--muted)]">
                (none in this snapshot)
              </span>
            ) : null}
          </span>
        </label>

        <label className="flex items-start gap-2 text-sm text-[var(--ink-soft)]">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-[var(--line)]"
            checked={applyLocationRoots}
            disabled={busy}
            onChange={(e) => onApplyLocationRoots(e.target.checked)}
          />
          <span>Apply location roots from snapshot</span>
        </label>

        <Tooltip content={HOLDINGS_TIP} className="block w-full">
          <label
            className="flex cursor-not-allowed items-start gap-2 text-sm text-[var(--muted)] opacity-70"
            title={HOLDINGS_TIP}
          >
            <input
              type="checkbox"
              className="mt-0.5 rounded border-[var(--line)]"
              checked={false}
              disabled
              readOnly
            />
            <span>Restore holdings onto live stacks</span>
          </label>
        </Tooltip>
        {preview.hasHoldings ? (
          <p className="pl-6 text-xs text-[var(--muted)]">
            This snapshot includes holdings trees (
            <code className="code-inline">holdings/</code>). Helix will{" "}
            <strong className="font-medium text-[var(--ink-soft)]">not</strong>{" "}
            copy them onto live stacks in this version. Returning the catalog
            does not move files under Archive or Vault.
          </p>
        ) : null}
      </div>

      <label className="flex items-start gap-2 text-sm text-[var(--ink-soft)]">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-[var(--line)]"
          checked={acknowledge}
          disabled={busy}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span>{ACK_LABEL}</span>
      </label>

      <label className="block">
        <span className="label-quiet">Confirm phrase</span>
        <input
          type="text"
          className="field font-mono"
          value={phrase}
          disabled={busy}
          placeholder="Type RESTORE to confirm"
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => onPhrase(e.target.value)}
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-danger min-h-11"
          disabled={!canApply}
          onClick={onApply}
        >
          {applying ? (
            <HelixSpinner size="md" decorative />
          ) : (
            <RotateCcw className="h-4 w-4" />
          )}
          Return this snapshot
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-11"
          disabled={applying}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function LocationTable({
  preview,
  applyLocationRoots,
  locationActions,
  disabled,
  onAction,
  onRemapTo,
}: {
  preview: RestorePreview;
  applyLocationRoots: boolean;
  locationActions: LocationDraft[];
  disabled: boolean;
  onAction: (name: string, action: RestoreLocationAction) => void;
  onRemapTo: (name: string, remapTo: string) => void;
}) {
  if (preview.locations.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)]">
        No locations in this snapshot.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--line)]">
      <table className="w-full min-w-[36rem] text-left text-xs">
        <thead className="bg-[var(--paper-deep)] text-[var(--muted)]">
          <tr>
            <th className="px-2.5 py-1.5 font-semibold">Location</th>
            <th className="px-2.5 py-1.5 font-semibold">Archived root</th>
            <th className="px-2.5 py-1.5 font-semibold">Live root</th>
            <th className="px-2.5 py-1.5 font-semibold">
              {applyLocationRoots ? "Action" : "Default"}
            </th>
          </tr>
        </thead>
        <tbody>
          {preview.locations.map((loc) => {
            const draft = locationActions.find((a) => a.name === loc.name);
            const action = draft?.action ?? loc.defaultAction;
            return (
              <tr key={loc.name} className="border-t border-[var(--line)]">
                <td className="px-2.5 py-1.5 font-medium text-[var(--ink)]">
                  {loc.name}
                  {loc.forbidden ? (
                    <span className="ml-1.5 text-[0.6rem] uppercase text-[var(--warn)]">
                      forbidden
                    </span>
                  ) : null}
                </td>
                <td className="max-w-[14rem] truncate px-2.5 py-1.5 font-mono text-[0.65rem] text-[var(--muted)]">
                  {loc.archivedRoot}
                  {!loc.archivedRootExists ? (
                    <span className="ml-1 text-[var(--warn)]">missing</span>
                  ) : null}
                </td>
                <td className="max-w-[14rem] truncate px-2.5 py-1.5 font-mono text-[0.65rem] text-[var(--muted)]">
                  {loc.liveRoot ?? "—"}
                  {loc.liveRoot && !loc.liveExists ? (
                    <span className="ml-1 text-[var(--warn)]">missing</span>
                  ) : null}
                </td>
                <td className="px-2.5 py-1.5">
                  {applyLocationRoots ? (
                    <div className="space-y-1">
                      <select
                        className="field py-1 text-xs"
                        value={action}
                        disabled={disabled}
                        onChange={(e) =>
                          onAction(
                            loc.name,
                            e.target.value as RestoreLocationAction,
                          )
                        }
                      >
                        {LOCATION_ACTIONS.map((opt) => (
                          <option
                            key={opt.value}
                            value={opt.value}
                            disabled={opt.value === "use-archived" && loc.forbidden}
                          >
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {action === "remap" ? (
                        <input
                          type="text"
                          className="field py-1 font-mono text-[0.65rem]"
                          placeholder="Absolute path"
                          value={draft?.remapTo ?? ""}
                          disabled={disabled}
                          onChange={(e) => onRemapTo(loc.name, e.target.value)}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <span className="capitalize text-[var(--ink-soft)]">
                      {loc.defaultAction.replace("-", " ")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SuccessCard({
  success,
  bannerDismissed,
  onDismissBanner,
  onAnother,
}: {
  success: SuccessView;
  bannerDismissed: boolean;
  onDismissBanner: () => void;
  onAnother: () => void;
}) {
  const deemphasizeReindex = success.missingRoots.length > 0;

  return (
    <div className="mt-4 space-y-3">
      <p className="text-sm text-[var(--ok)]" role="status">
        Returned snapshot{" "}
        <code className="code-inline">{success.name}</code>. Undo snapshot:{" "}
        {success.undoBackup ? (
          <code className="code-inline">{success.undoBackup}</code>
        ) : (
          "—"
        )}
        {success.itemCount != null ? ` · ${success.itemCount} items` : ""}.
      </p>
      {success.partial ? (
        <p className="text-xs text-[var(--warn)]" role="status">
          Catalog returned, but thumbs or a follow-up step was partial
          {success.error ? `: ${success.error}` : "."}
        </p>
      ) : null}
      {deemphasizeReindex ? (
        <p className="text-xs text-[var(--warn)]">
          These location roots are missing on disk:{" "}
          {success.missingRoots.join(", ")}. Confirm roots before reindex — a
          run now would mark those holdings missing.
        </p>
      ) : null}

      {!bannerDismissed ? (
        <div
          className="flex items-start justify-between gap-2 rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--warn)_40%,var(--line))] bg-[color-mix(in_srgb,var(--warn)_8%,var(--paper-deep))] px-3 py-2.5"
          role="status"
        >
          <p className="text-xs text-[var(--ink-soft)]">
            Reading positions and recent opens in this browser may not match
            the returned catalog. Helix does not clear them.
          </p>
          <button
            type="button"
            className="btn btn-ghost btn-sm shrink-0"
            onClick={onDismissBanner}
            aria-label="Dismiss browser-memory notice"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-start gap-2">
        {deemphasizeReindex ? (
          <a href="#reindex" className="btn btn-ghost min-h-11">
            Reindex section
          </a>
        ) : (
          <ReindexButton />
        )}
        <Link href="/catalog" className="btn btn-secondary min-h-11">
          Open catalog
        </Link>
        {success.undoBackup ? (
          <a
            href={`/api/backup/download/${encodeURIComponent(success.undoBackup)}`}
            className="btn btn-ghost min-h-11"
          >
            <Download className="h-4 w-4" />
            Download undo snapshot
          </a>
        ) : null}
        <button type="button" className="btn btn-ghost min-h-11" onClick={onAnother}>
          Restore another
        </button>
      </div>
    </div>
  );
}
