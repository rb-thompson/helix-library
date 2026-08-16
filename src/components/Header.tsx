"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { HeaderJobsStrip } from "@/components/HeaderJobsStrip";
import { HelixMark } from "@/components/HelixMark";
import { useSidebar } from "@/components/AppShell";
import { ThemeToggle } from "@/components/ThemeToggle";

export function Header() {
  const { mobileOpen, setMobileOpen } = useSidebar();

  return (
    <header className="site-header sticky top-0 z-50 supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
      <div className="shell-x flex h-14 items-center justify-between gap-2 sm:gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            className="btn btn-secondary btn-icon lg:hidden"
            aria-expanded={mobileOpen}
            aria-controls="app-sidebar"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            title={mobileOpen ? "Close menu" : "Open navigation menu"}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? (
              <X className="h-4 w-4" aria-hidden />
            ) : (
              <Menu className="h-4 w-4" aria-hidden />
            )}
          </button>
          <Link
            href="/"
            title="Helix Library home"
            aria-label="Helix Library home"
            className="flex min-w-0 items-center gap-2.5 lg:hidden"
          >
            <span className="helix-mark-well h-9 w-9 shrink-0 rounded-[0.6rem] border">
              <HelixMark />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)]">
                Helix
                <span className="hidden font-medium text-[var(--muted)] sm:inline">
                  {" "}
                  Library
                </span>
              </span>
            </span>
          </Link>
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <HeaderJobsStrip />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
