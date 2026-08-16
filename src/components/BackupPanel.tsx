"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Archive,
  Download,
  HardDrive,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { HelixSpinner } from "@/components/icons/HelixSpinner";
import { requestRestore } from "@/components/RestorePanel";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { cn } from "@/lib/cn";
import { formatBytes, formatDate } from "@/lib/format";

type BackupRow = {
  name: string;
  bytes: number;
  mtimeMs: number;
  mode: string;
};

type JobProgress = {
  stage: string;
  percent: number | null;
  detail?: string;
};

export function BackupPanel() {
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [busy, setBusy] = useState<null | "catalog" | "full">(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [includeThumbs, setIncludeThumbs] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function pollJob(jobId: number) {
    for (let i = 0; i < 900; i++) {
      await new Promise((r) => setTimeout(r, i === 0 ? 200 : 800));
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok || !data.ok) continue;
        const job = data.job as {
          status: string;
          error: string | null;
          progress?: JobProgress;
          result?: Record<string, unknown> | null;
        };
        if (job.progress) setProgress(job.progress);
        if (job.status === "completed") {
          const name =
            typeof job.result?.name === "string" ? job.result.name : null;
          const bytes =
            typeof job.result?.bytes === "number" ? job.result.bytes : null;
          setMessage(
            name
              ? `Saved ${name}${bytes != null ? ` (${formatBytes(bytes)})` : ""}`
              : "Backup complete",
          );
          setProgress(null);
          await refresh();
          return;
        }
        if (job.status === "failed" || job.status === "cancelled") {
          setError(job.error ?? "Backup failed");
          setProgress(null);
          return;
        }
      } catch {
        /* keep polling */
      }
    }
    setError("Timed out waiting for backup job");
    setProgress(null);
  }

  async function start(mode: "catalog" | "full") {
    setBusy(mode);
    setError(null);
    setMessage(null);
    setProgress({ stage: "starting", percent: 0, detail: "Initiating…" });
    try {
      const res = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, includeThumbs }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to start backup");
        setProgress(null);
        return;
      }
      if (data.jobId) {
        await pollJob(Number(data.jobId));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setProgress(null);
    } finally {
      setBusy(null);
    }
  }

  async function remove(name: string) {
    if (!confirm(`Delete backup ${name}?`)) return;
    setDeleting(name);
    setError(null);
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(name)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex items-start gap-2">
        <Archive className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
            Export / backup
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Snapshot the catalog (and optionally holdings) to{" "}
            <code className="code-inline">data/exports/</code> as{" "}
            <code className="code-inline">.tar.gz</code>. Does{" "}
            <strong className="font-medium text-[var(--ink-soft)]">not</strong>{" "}
            include API keys. Inspect a local snapshot and return it over the
            live catalog (typed confirm). Holdings trees are not overwritten.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-soft)]">
        <input
          type="checkbox"
          className="rounded border-[var(--line)]"
          checked={includeThumbs}
          onChange={(e) => setIncludeThumbs(e.target.checked)}
          disabled={busy !== null}
        />
        Include thumbs (webp posters)
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary min-h-11"
          disabled={busy !== null}
          onClick={() => void start("catalog")}
        >
          {busy === "catalog" ? (
            <HelixSpinner size="md" decorative />
          ) : (
            <HardDrive className="h-4 w-4" />
          )}
          Catalog backup
        </button>
        <button
          type="button"
          className="btn btn-ghost min-h-11"
          disabled={busy !== null}
          onClick={() => void start("full")}
          title="Includes enabled location file trees — may be large"
        >
          {busy === "full" ? (
            <HelixSpinner size="md" decorative />
          ) : (
            <Archive className="h-4 w-4" />
          )}
          Full backup
        </button>
      </div>

      <p className="mt-2 text-xs text-[var(--muted-faint)]">
        <strong className="font-medium">Catalog</strong> = config + SQLite +
        optional thumbs. <strong className="font-medium">Full</strong> adds
        enabled scan roots under <code className="code-inline">holdings/</code>.
        CLI: <code className="code-inline">npm run backup</code>
      </p>

      {progress ? (
        <ProgressBar
          percent={progress.percent}
          active={busy !== null}
          label={progress.stage.replace(/_/g, " ")}
          detail={progress.detail}
          className="mt-3"
        />
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-2 text-xs text-[var(--ok)]">{message}</p>
      ) : null}

      <div className="mt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          Local archives
        </h3>
        {backups.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--muted)]">No backups yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {backups.map((b) => (
              <li
                key={b.name}
                className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--line)] bg-[var(--paper-deep)] p-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-[var(--ink)]">
                    {b.name}
                  </p>
                  <p className="text-[0.7rem] text-[var(--muted)]">
                    <span
                      className={cn(
                        "mr-1.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase",
                        b.mode === "full"
                          ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "bg-[color-mix(in_srgb,var(--ok)_18%,transparent)] text-[var(--ok)]",
                      )}
                    >
                      {b.mode}
                    </span>
                    {b.name.includes("-prerestore-") ? (
                      <span className="mr-1.5 rounded-full bg-[color-mix(in_srgb,var(--warn)_18%,transparent)] px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase text-[var(--warn)]">
                        undo point
                      </span>
                    ) : null}
                    {formatBytes(b.bytes)} · {formatDate(b.mtimeMs)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <a
                    href={`/api/backup/download/${encodeURIComponent(b.name)}`}
                    className="btn btn-primary btn-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy !== null}
                    onClick={() => requestRestore(b.name)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-[var(--danger)]"
                    disabled={deleting === b.name || busy !== null}
                    onClick={() => void remove(b.name)}
                  >
                    {deleting === b.name ? (
                      <HelixSpinner size="sm" decorative />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
