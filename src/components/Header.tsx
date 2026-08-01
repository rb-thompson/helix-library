"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { BookOpen, Library, Menu, X } from "lucide-react";
import { MAIN_NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[rgb(255_252_247_/_0.86)] backdrop-blur-md supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-3 sm:h-15 sm:px-4 lg:px-6">
        <Link
          href="/"
          title="Home — search, stats, and quick links"
          className="group flex min-w-0 items-center gap-2.5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[0.55rem] bg-[var(--accent)] text-white shadow-[0_1px_0_rgb(255_255_255_/_0.12)_inset,0_1px_2px_rgb(15_92_86_/_0.25)] transition group-hover:bg-[var(--accent-hover)] sm:h-9 sm:w-9">
            <Library className="h-4 w-4 sm:h-[1.1rem] sm:w-[1.1rem]" aria-hidden />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="hidden text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-[var(--muted)] sm:block">
              Personal
            </span>
            <span className="block truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)] sm:text-base">
              non-os
              <span className="hidden font-medium text-[var(--muted)] sm:inline">
                {" "}
                library
              </span>
            </span>
          </span>
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-0.5 lg:flex"
          aria-label="Main"
        >
          {MAIN_NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.tip}
                className={cn("nav-link", active && "is-active")}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/catalog"
            title="Jump into the catalog"
            className="btn btn-primary btn-sm hidden sm:inline-flex"
          >
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Browse
          </Link>
          <Link
            href="/catalog"
            title="Browse catalog"
            className="btn btn-primary btn-icon sm:hidden"
            aria-label="Browse catalog"
          >
            <BookOpen className="h-4 w-4" aria-hidden />
          </Link>

          <button
            type="button"
            className="btn btn-secondary btn-icon lg:hidden"
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? "Close menu" : "Open menu"}
            title={open ? "Close menu" : "Open navigation menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? (
              <X className="h-4 w-4" aria-hidden />
            ) : (
              <Menu className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <div className="lg:hidden">
          <button
            type="button"
            className="fixed inset-0 z-40 bg-[rgb(26_22_20_/_0.35)] backdrop-blur-[2px]"
            aria-label="Close menu overlay"
            onClick={() => setOpen(false)}
          />
          <div
            id={panelId}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-x-0 top-full z-50 max-h-[min(70vh,28rem)] overflow-y-auto border-b border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lift)]"
          >
            <nav
              className="mx-auto max-w-7xl px-3 py-3 sm:px-4"
              aria-label="Mobile"
            >
              <ul className="space-y-0.5">
                {MAIN_NAV.map((item) => {
                  const active =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.tip}
                        className={cn(
                          "flex flex-col rounded-[var(--radius-sm)] px-3 py-3 transition",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                            : "text-[var(--ink)] hover:bg-[rgb(28_25_23_/_0.04)]",
                        )}
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-sm font-semibold">{item.label}</span>
                        <span className="mt-0.5 text-xs font-normal leading-snug text-[var(--muted)]">
                          {item.tip}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 border-t border-[var(--line)] pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                <Link
                  href="/catalog"
                  className="btn btn-primary w-full"
                  onClick={() => setOpen(false)}
                >
                  <BookOpen className="h-4 w-4" aria-hidden />
                  Browse catalog
                </Link>
              </div>
            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
