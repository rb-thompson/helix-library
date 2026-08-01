import path from "node:path";
import Link from "next/link";
import { ReindexButton } from "@/components/ReindexButton";
import { LocationAdmin } from "@/components/LocationAdmin";
import { HelpTip } from "@/components/Tooltip";
import { listLocationsWithCounts } from "@/lib/catalog/query";
import { loadConfig, projectRoot } from "@/lib/config";
import { ensureLocationsSynced } from "@/lib/locations/manage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Locations",
};

export default function LocationsPage() {
  ensureLocationsSynced();
  const locations = listLocationsWithCounts();
  const config = loadConfig();
  const archiveHint = path.join(projectRoot(), "archive");

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <p className="eyebrow">Branches</p>
          <h1 className="page-title mt-1 flex flex-wrap items-center gap-2">
            Locations
            <HelpTip content="Like library branches: folders non-os may index." />
          </h1>
          <p className="page-sub max-w-xl">
            Scan roots the catalog is allowed to index. Primary holdings live under{" "}
            <code className="rounded bg-[var(--paper-deep)] px-1 text-xs">
              archive/
            </code>
            .{" "}
            <Link href="/docs#locations" className="link-accent">
              Learn more
            </Link>
          </p>
        </div>
        <ReindexButton />
      </div>

      <LocationAdmin locations={locations} defaultRootHint={archiveHint} />

      <section className="surface p-4 sm:p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
          Ignore patterns
          <HelpTip content="Paths matching these globs are never indexed. Edit library.config.json to change them." />
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Skipped during indexing:
        </p>
        <ul className="mt-2.5 flex flex-wrap gap-1.5">
          {config.ignore.map((g) => (
            <li
              key={g}
              className="rounded-[var(--radius-sm)] bg-[var(--paper-deep)] px-2 py-0.5 font-mono text-[0.7rem] text-[var(--ink-soft)]"
            >
              {g}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
