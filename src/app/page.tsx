import Link from "next/link";
import {
  ArrowUpRight,
  BookOpen,
  Download,
  FolderOpen,
  HardDrive,
  Layers,
  MessageCircle,
  Network,
  RefreshCw,
  Search,
} from "lucide-react";
import { ItemRow } from "@/components/ItemRow";
import { SearchForm } from "@/components/SearchForm";
import { StatusLine } from "@/components/ui/StatusLine";
import {
  catalogStats,
  listLocationsWithCounts,
  recentItems,
} from "@/lib/catalog/query";
import { collectionCount, listCollections } from "@/lib/collections/manage";
import { kindLabel } from "@/lib/format";
import { hasThumb } from "@/lib/indexer/enrich";
import { getLatestJob, isReindexRunning } from "@/lib/indexer/run";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export default function HomePage() {
  ensureLocationsSynced();
  const stats = catalogStats();
  const locations = listLocationsWithCounts().filter((l) => l.enabled);
  const recent = recentItems(6);
  const collections = listCollections().slice(0, 4);
  const colCount = collectionCount();
  const latestJob = getLatestJob();
  const reindexRunning = isReindexRunning();

  return (
    <div className="space-y-7 sm:space-y-10">
      <section className="surface hero-frame relative overflow-hidden px-4 py-7 sm:px-8 sm:py-10 lg:px-10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-helix.jpg"
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[var(--surface)] via-[color-mix(in_srgb,var(--surface)_82%,transparent)] to-[color-mix(in_srgb,var(--surface)_40%,transparent)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-[color-mix(in_srgb,var(--surface)_50%,transparent)]"
          aria-hidden
        />
        <div className="relative">
          <p className="eyebrow">Your personal library</p>
          <h1 className="mt-2 max-w-xl text-[1.65rem] font-semibold tracking-tight text-[var(--ink)] sm:text-3xl lg:text-[2.15rem] lg:leading-[1.15]">
            Find what you put here — quickly.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[var(--muted)] sm:text-[0.9375rem]">
            Search names, paths, notes, and PDF text. Browse by format. Ask the
            Librarian when you only remember a fragment.{" "}
            <Link href="/docs" className="link-accent">
              Getting started
            </Link>
          </p>
          <div className="mt-5 max-w-xl sm:mt-6">
            <SearchForm large />
          </div>
          <div className="mt-5 flex flex-wrap gap-1.5 sm:mt-6 sm:gap-2">
            <span className="chip chip-stat">
              <span className="chip-label">Holdings</span>
              <span className="chip-value">{stats.total}</span>
            </span>
            <span className="chip chip-stat">
              <span className="chip-label">Locations</span>
              <span className="chip-value">{stats.locationCount}</span>
            </span>
            {stats.byKind.slice(0, 4).map((k) => (
              <Link
                key={k.kind}
                href={`/catalog?kind=${k.kind}`}
                className="chip chip-stat"
                title={`Browse ${kindLabel(k.kind)}`}
              >
                <span className="chip-label">{kindLabel(k.kind)}</span>
                <span className="chip-value">{k.c}</span>
              </Link>
            ))}
            {stats.missing > 0 ? (
              <Link
                href="/catalog?missing=1"
                className="chip chip-stat text-[var(--danger)]"
                title="Weeding desk — holdings not found on disk"
              >
                <span className="chip-label">Missing</span>
                <span className="chip-value">{stats.missing}</span>
              </Link>
            ) : null}
          </div>
          {reindexRunning || (latestJob && latestJob.status === "failed") ? (
            <div className="mt-4">
              {reindexRunning ? (
                <StatusLine tone="info" pulse>
                  Reindex running
                  {latestJob ? ` (#${latestJob.id})` : ""}…{" "}
                  <Link href="/services" className="link-accent">
                    Services
                  </Link>
                </StatusLine>
              ) : (
                <StatusLine tone="danger">
                  Last reindex failed
                  {latestJob ? ` (#${latestJob.id})` : ""}.{" "}
                  <Link href="/services" className="link-accent">
                    Check Services
                  </Link>
                </StatusLine>
              )}
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-4">
        <ServiceCard
          href="/catalog"
          icon={<Search className="h-4 w-4" />}
          title="Catalog"
          body="Search & preview holdings"
        />
        <ServiceCard
          href="/graph"
          icon={<Network className="h-4 w-4" />}
          title="Graph"
          body="3D knowledge map"
        />
        <ServiceCard
          href="/collections"
          icon={<Layers className="h-4 w-4" />}
          title="Collections"
          body={`${colCount} shelf${colCount === 1 ? "" : "ves"}`}
        />
        <ServiceCard
          href="/locations"
          icon={<FolderOpen className="h-4 w-4" />}
          title="Locations"
          body="Scan roots"
        />
        <ServiceCard
          href="/acquire"
          icon={<Download className="h-4 w-4" />}
          title="Acquire"
          body="arXiv, YT, Grok images"
        />
        <ServiceCard
          href="/services"
          icon={<HardDrive className="h-4 w-4" />}
          title="Services"
          body="Reindex & machine"
        />
        <ServiceCard
          href="/ask"
          icon={<MessageCircle className="h-4 w-4" />}
          title="Ask"
          body="Find in plain language"
        />
        <ServiceCard
          href="/docs"
          icon={<BookOpen className="h-4 w-4" />}
          title="Docs"
          body="How it works"
        />
      </section>

      <div className="grid gap-6 sm:gap-8 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionHead title="Locations" href="/locations" linkLabel="Manage" />
          {locations.length === 0 ? (
            <div className="empty-state">
              <strong>No locations yet</strong>
              <Link href="/locations" className="link-accent">
                Add a scan root
              </Link>{" "}
              (start with{" "}
              <code className="rounded bg-[var(--paper-deep)] px-1 text-xs">
                archive/
              </code>
              ) then reindex.
            </div>
          ) : (
            <ul className="surface-flat overflow-hidden">
              {locations.map((loc) => (
                <li
                  key={loc.id}
                  className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ink)]">
                      {loc.name}
                    </p>
                    <p className="truncate font-mono text-[0.7rem] text-[var(--muted)]">
                      {loc.rootPath}
                    </p>
                  </div>
                  <div className="shrink-0 text-right text-sm tabular-nums text-[var(--muted)]">
                    <p className="font-medium text-[var(--ink-soft)]">
                      {loc.itemCount}
                    </p>
                    <p className="text-[0.7rem]">
                      {loc.enabled ? "Enabled" : "Disabled"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="min-w-0">
          <SectionHead
            title="Recently indexed"
            href="/catalog"
            linkLabel="Full catalog"
          />
          {recent.length === 0 ? (
            <div className="empty-state">
              <strong>Catalog is empty</strong>
              <Link href="/services" className="link-accent">
                Run a reindex
              </Link>{" "}
              to load holdings.
            </div>
          ) : (
            <ul className="surface-flat overflow-hidden">
              {recent.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  hasPreview={hasThumb(item.id)}
                />
              ))}
            </ul>
          )}
          {collections.length > 0 ? (
            <div className="mt-5">
              <SectionHead
                title="Collections"
                href="/collections"
                linkLabel="All"
                compact
              />
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {collections.map((c) => (
                  <li key={c.id}>
                    <Link href={`/collections/${c.id}`} className="chip">
                      {c.name}
                      <span className="tabular-nums text-[var(--muted-faint)]">
                        {c.itemCount}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>

      {stats.total === 0 ? (
        <section className="surface-flat border-[var(--accent-ring)] bg-[var(--accent-soft)] px-5 py-4 text-sm text-[var(--ink)]">
          <div className="flex items-start gap-3">
            <RefreshCw
              className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]"
              aria-hidden
            />
            <div>
              <p className="font-semibold">First run</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-[var(--ink-soft)]">
                <li>
                  Drop files into{" "}
                  <code className="rounded bg-[var(--surface)] px-1 text-xs">
                    archive/
                  </code>
                </li>
                <li>
                  <Link href="/services" className="link-accent">
                    Reindex
                  </Link>{" "}
                  or run{" "}
                  <code className="rounded bg-[var(--surface)] px-1 text-xs">
                    npm run reindex
                  </code>
                </li>
                <li>Search, shelf, and ask the Librarian</li>
              </ol>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function SectionHead({
  title,
  href,
  linkLabel,
  compact = false,
}: {
  title: string;
  href: string;
  linkLabel: string;
  compact?: boolean;
}) {
  return (
    <div className={`mb-2.5 flex items-center justify-between gap-2 ${compact ? "mb-0" : ""}`}>
      <h2
        className={
          compact
            ? "text-sm font-semibold text-[var(--ink)]"
            : "text-base font-semibold tracking-tight text-[var(--ink)]"
        }
      >
        {title}
      </h2>
      <Link
        href={href}
        className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--accent)] hover:underline"
      >
        {linkLabel}
        <ArrowUpRight className="h-3 w-3 opacity-70" aria-hidden />
      </Link>
    </div>
  );
}

function ServiceCard({
  href,
  icon,
  title,
  body,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <Link href={href} className="service-tile group">
      <div className="service-tile__icon relative z-[1]">{icon}</div>
      <h3 className="relative z-[1] mt-2.5 text-sm font-semibold tracking-tight text-[var(--ink)]">
        {title}
      </h3>
      <p className="relative z-[1] mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">
        {body}
      </p>
    </Link>
  );
}
