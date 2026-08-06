"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Menu, X } from "lucide-react";
import { HelixMark } from "@/components/HelixMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  PRIMARY_NAV,
  SECONDARY_NAV,
  isNavActive,
  isSecondaryActive,
} from "@/lib/nav";
import { cn } from "@/lib/cn";

export function Header() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const panelId = useId();
  const moreId = useId();
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
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

  useEffect(() => {
    if (!moreOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMoreOpen(false);
    }
    function onPointer(e: MouseEvent) {
      if (!moreRef.current?.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [moreOpen]);

  const secondaryActive = isSecondaryActive(pathname);

  return (
    <header className="site-header sticky top-0 z-50 supports-[padding:max(0px)]:pt-[env(safe-area-inset-top)]">
      <div className="shell-x flex h-14 items-center justify-between gap-2 sm:gap-3">
        <Link
          href="/"
          title="Helix Library home"
          aria-label="Helix Library home"
          className="flex min-w-0 items-center gap-2.5"
        >
          <span className="helix-mark-well h-9 w-9 shrink-0 rounded-[0.6rem] border sm:h-10 sm:w-10">
            <HelixMark />
          </span>
          <span className="min-w-0 leading-tight">
            <span className="hidden text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] sm:block">
              Personal
            </span>
            <span className="block truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)] sm:text-base">
              Helix
              <span className="hidden font-medium text-[var(--muted)] sm:inline">
                {" "}
                Library
              </span>
            </span>
          </span>
        </Link>

        <nav
          className="hidden flex-1 items-center justify-center gap-0.5 lg:flex"
          aria-label="Main"
        >
          {PRIMARY_NAV.map((item) => {
            const active = isNavActive(pathname, item.href);
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

          <div className="relative" ref={moreRef}>
            <button
              type="button"
              className={cn(
                "nav-link inline-flex items-center gap-0.5",
                (moreOpen || secondaryActive) && "is-active",
              )}
              aria-expanded={moreOpen}
              aria-controls={moreId}
              aria-haspopup="menu"
              title="Locations, Services, Docs"
              onClick={() => setMoreOpen((v) => !v)}
            >
              More
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 opacity-70 transition",
                  moreOpen && "rotate-180",
                )}
                aria-hidden
              />
            </button>
            {moreOpen ? (
              <div
                id={moreId}
                role="menu"
                aria-label="More destinations"
                className="absolute left-1/2 top-[calc(100%+0.35rem)] z-[60] min-w-[11.5rem] -translate-x-1/2 rounded-[var(--radius-sm)] border border-[var(--line-strong)] bg-[var(--surface-raised)] p-1 shadow-[var(--shadow-lift)]"
              >
                {SECONDARY_NAV.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      title={item.tip}
                      className={cn(
                        "flex flex-col rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-2 transition",
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                          : "text-[var(--ink-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
                      )}
                      onClick={() => setMoreOpen(false)}
                    >
                      <span className="text-[0.8125rem] font-medium">
                        {item.label}
                      </span>
                      <span className="text-[0.65rem] text-[var(--muted)]">
                        {item.tip}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
          <ThemeToggle />
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
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
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
                {PRIMARY_NAV.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.tip}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                            : "text-[var(--ink)] hover:bg-[var(--surface-hover)]",
                        )}
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-sm font-semibold">
                          {item.label}
                        </span>
                        <span className="truncate text-xs text-[var(--muted)]">
                          {item.tip}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <p className="label-quiet mt-3 px-3 !mb-1">Library ops</p>
              <ul className="space-y-0.5">
                {SECONDARY_NAV.map((item) => {
                  const active = isNavActive(pathname, item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        title={item.tip}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-[var(--radius-sm)] px-3 py-2.5 transition",
                          active
                            ? "bg-[var(--accent-soft)] text-[var(--ink)]"
                            : "text-[var(--ink-soft)] hover:bg-[var(--surface-hover)] hover:text-[var(--ink)]",
                        )}
                        onClick={() => setOpen(false)}
                      >
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="truncate text-xs text-[var(--muted)]">
                          {item.tip}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>

            </nav>
          </div>
        </div>
      ) : null}
    </header>
  );
}
