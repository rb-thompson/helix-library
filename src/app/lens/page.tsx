import Link from "next/link";
import type { Metadata } from "next";
import { Aperture } from "lucide-react";
import { recentItems } from "@/lib/catalog/query";
import { displayTitle } from "@/lib/catalog/display";
import { KindBadge } from "@/components/KindBadge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Deep Lens",
  description:
    "Encyclopedia terminal for any holding — article, source, neighbors, notes.",
};

export default function DeepLensIndexPage() {
  const recent = recentItems(16);

  return (
    <div className="space-y-6 sm:space-y-8">
      <div
        className="lens-term overflow-hidden"
        style={{ ["--lens-kind" as string]: "var(--accent)" }}
      >
        <header className="lens-term-chrome">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <strong>Helix // Deep Lens</strong>
            <span>index</span>
          </div>
          <span className="lens-term-live">ready</span>
        </header>

        <div className="relative z-[2] px-5 py-8 sm:px-8 sm:py-10">
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-[var(--muted)]">
            Knowledge terminal
          </p>
          <h1 className="mt-2 flex flex-wrap items-center gap-2 text-3xl font-semibold tracking-tight text-[var(--ink)] sm:text-4xl">
            <Aperture className="h-8 w-8 text-[var(--accent)]" aria-hidden />
            Deep Lens
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-[var(--ink-soft)] sm:text-lg">
            An encyclopedia page for anything in your library. Open a holding
            and get a compiled article, the source itself, its neighborhood, and
            your notes — framed like a modern info terminal.
          </p>
          <p className="mt-3 font-mono text-xs text-[var(--muted)]">
            Keys 1–4 switch panes · Compile builds the article · Nothing leaves
            the machine unless you use Grok
          </p>
        </div>

        <section className="relative z-[2] border-t border-[var(--line)] px-4 py-5 sm:px-8">
          <h2 className="lens-section-h !mt-0">Recent holdings</h2>
          {recent.length === 0 ? (
            <div className="empty-state">
              <strong>Catalog is empty</strong>
              <Link href="/services" className="link-accent">
                Run a reindex
              </Link>{" "}
              then return here.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--line)] rounded-lg border border-[var(--line)]">
              {recent.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/lens/${item.id}`}
                    className="flex items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--surface-hover)]"
                  >
                    <span className="w-10 shrink-0 font-mono text-[0.65rem] tabular-nums text-[var(--muted)]">
                      {String(item.id).padStart(4, "0")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--ink)]">
                      {displayTitle(item)}
                    </span>
                    <KindBadge kind={item.kind} className="shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 text-sm text-[var(--muted)]">
            Or open any item in the{" "}
            <Link href="/catalog" className="link-accent">
              catalog
            </Link>{" "}
            and hit <strong>Deep Lens</strong>.
          </p>
        </section>
      </div>
    </div>
  );
}
