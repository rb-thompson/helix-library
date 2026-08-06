import Link from "next/link";
import { MAIN_NAV } from "@/lib/nav";

export function Footer() {
  return (
    <footer className="site-footer mt-auto pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="shell-x py-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md">
            <p className="text-sm text-[var(--ink-soft)]">
              <span className="font-semibold text-[var(--ink)]">Helix Library</span>
              <span className="text-[var(--muted)]"> — </span>
              personal library for files, knowledge, and this machine.
            </p>
            <p className="mt-1.5 text-xs text-[var(--muted-faint)]">
              Local by default · catalog-first · v0.1
            </p>
          </div>
          <nav
            className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3"
            aria-label="Footer"
          >
            {MAIN_NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                title={item.tip}
                className="text-[var(--muted)] transition hover:text-[var(--ink)]"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="mt-5 border-t border-[var(--line)] pt-3 text-xs">
          <Link href="/docs" className="link-accent" title="Getting started">
            Docs & getting started
          </Link>
        </div>
      </div>
    </footer>
  );
}
