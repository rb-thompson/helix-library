import Link from "next/link";
import { JobsPanel } from "@/components/JobsPanel";
import { ReindexButton } from "@/components/ReindexButton";
import { formatBytes, formatDate } from "@/lib/format";
import {
  getLatestJob,
  isReindexRunning,
  serializeJob,
} from "@/lib/indexer/run";
import { listJobs } from "@/lib/jobs/store";
import { probeMachine } from "@/lib/machine/probe";
import { ensureLocationsSynced } from "@/lib/locations/manage";
import type { IndexJobStats } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Services",
};

export default function ServicesPage() {
  ensureLocationsSynced();
  const machine = probeMachine();
  const latest = getLatestJob();
  const initialJob = latest ? serializeJob(latest) : null;
  const stats = (initialJob?.stats ?? null) as IndexJobStats | null;
  const running = isReindexRunning();
  const recentJobs = listJobs({ limit: 20 });

  return (
    <div className="space-y-5 sm:space-y-8">
      <div>
        <p className="eyebrow">Operations</p>
        <h1 className="page-title mt-1">Services</h1>
        <p className="page-sub">
          Reindex holdings and inspect this machine as the library building.
        </p>
      </div>

      <JobsPanel initialJobs={recentJobs} />

      <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
        <section className="surface p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
            Reindex
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Walk enabled locations and refresh the catalog in the background.
            Unchanged files are skipped.
            {running ? " A job is currently running." : ""}
          </p>
          <div className="mt-4">
            <ReindexButton initialJob={initialJob} />
          </div>
          {latest ? (
            <div className="surface-inset mt-4 p-3 text-sm text-[var(--ink-soft)]">
              <p>
                <span className="font-medium">Last job</span> #{latest.id} ·{" "}
                {latest.status}
              </p>
              <p className="text-xs text-[var(--muted)]">
                Started {formatDate(latest.startedAt)} · Finished{" "}
                {formatDate(latest.finishedAt)}
              </p>
              {stats ? (
                <p className="mt-1 text-xs">
                  seen {stats.seen} · added {stats.added} · updated{" "}
                  {stats.updated} · unchanged {stats.unchanged} · missing{" "}
                  {stats.missing} · skipped {stats.skipped} · errors{" "}
                  {stats.errors}
                </p>
              ) : null}
              {latest.error ? (
                <p className="mt-1 text-[var(--danger)]">{latest.error}</p>
              ) : null}
            </div>
          ) : null}
          <p className="mt-3 text-xs text-[var(--muted)]">
            CLI:{" "}
            <code className="code-inline">npm run reindex</code>
            {" · "}
            auto on file changes:{" "}
            <code className="code-inline">npm run watch</code>
            {" "}
            (separate process; enabled location roots only).
          </p>
        </section>

        <section className="surface p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
            Acquire holdings
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Interlibrary-style imports: arXiv PDFs, YouTube/podcasts (yt-dlp),
            and Grok images into Archive.
          </p>
          <Link href="/acquire" className="btn btn-secondary mt-4">
            Open Acquire
          </Link>
        </section>

        <section className="surface p-4 sm:p-5">
          <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
            Ask the Librarian
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Discovery and help with catalog tools. Mutations are proposed for
            your approval.
          </p>
          <Link href="/ask" className="btn btn-secondary mt-4">
            Open Ask
          </Link>
        </section>
      </div>

      <section className="surface p-4 sm:p-5">
        <h2 className="text-base font-semibold tracking-tight text-[var(--ink)]">
          Building — this machine
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Read-only facility facts for capacity and limits.
        </p>
        <dl className="mt-4 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Fact label="Hostname" value={machine.hostname} />
          <Fact
            label="Platform"
            value={`${machine.platform} ${machine.release}`}
          />
          <Fact label="CPUs" value={String(machine.cpuCount)} />
          <Fact
            label="Load avg"
            value={machine.loadavg.map((n) => n.toFixed(2)).join(" · ")}
          />
          <Fact
            label="Memory"
            value={`${formatBytes(machine.memory.used)} used / ${formatBytes(machine.memory.total)}`}
          />
          <Fact
            label="Disk /"
            value={
              machine.disk
                ? `${formatBytes(machine.disk.free)} free / ${formatBytes(machine.disk.total)}`
                : "—"
            }
          />
          <Fact label="Bind" value={`${machine.bind}:${machine.port}`} />
          <Fact label="Database" value={machine.dbPath} mono />
          <Fact
            label="ffprobe"
            value={
              machine.tools.ffprobe
                ? "available — duration & video size"
                : "not found (install ffmpeg)"
            }
          />
          <Fact
            label="ffmpeg"
            value={
              machine.tools.ffmpeg
                ? "available — video posters"
                : "not found (install ffmpeg)"
            }
          />
          <Fact
            label="exiftool"
            value={
              machine.tools.exiftool
                ? "available — EXIF panel on items"
                : "not found (optional)"
            }
          />
          <Fact
            label="pdftotext"
            value={
              machine.tools.pdftotext
                ? "available — PDF text extraction"
                : "not found — using npm pdf-parse fallback"
            }
          />
          <Fact
            label="sharp"
            value="bundled — image dimensions & thumbs"
          />
        </dl>
        <p className="mt-4 text-xs text-[var(--muted)]">
          Optional host tools:{" "}
          <code className="rounded bg-[var(--paper-deep)] px-1">
            sudo apt install libimage-exiftool-perl poppler-utils ffmpeg
          </code>
        </p>
      </section>
    </div>
  );
}

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="surface-inset px-3 py-2">
      <dt className="label-quiet mb-0.5">{label}</dt>
      <dd
        className={`break-all text-sm text-[var(--ink)] ${mono ? "font-mono text-xs" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
