"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { HelixMark } from "@/components/HelixMark";
import { NavIcon } from "@/components/icons/nav";
import {
  ARCADE_NAV,
  PRIMARY_NAV,
  SECONDARY_NAV,
  isNavActive,
  type NavItem,
} from "@/lib/nav";
import { cn } from "@/lib/cn";

function SidebarLink({
  item,
  onNavigate,
}: {
  item: NavItem;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = isNavActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      title={item.tip}
      aria-current={active ? "page" : undefined}
      data-tip={item.label}
      className={cn("app-sidebar-item tip tip-right", active && "is-active")}
      onClick={onNavigate}
    >
      <NavIcon name={item.icon} />
      <span className="app-sidebar-label">{item.label}</span>
    </Link>
  );
}

export function AppSidebar({
  mobileOpen,
  setMobileOpen,
  collapsed,
  toggleCollapsed,
}: {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
  collapsed: boolean;
  toggleCollapsed: () => void;
}) {
  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {mobileOpen ? (
        <button
          type="button"
          className="app-sidebar-scrim lg:hidden"
          aria-label="Close menu overlay"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <aside
        id="app-sidebar"
        className={cn("app-sidebar", mobileOpen && "is-open")}
        aria-label="Library navigation"
      >
        <div className="app-sidebar-top">
          <Link
            href="/"
            title="Helix Library home"
            aria-label="Helix Library home"
            className="app-sidebar-brand"
            onClick={closeMobile}
          >
            <span className="helix-mark-well h-9 w-9 shrink-0 rounded-[0.6rem] border">
              <HelixMark />
            </span>
            <span className="app-sidebar-label app-sidebar-brand-text">
              <span className="block text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-[var(--muted)]">
                Personal
              </span>
              <span className="block truncate text-[0.9375rem] font-semibold tracking-tight text-[var(--ink)]">
                Helix Library
              </span>
            </span>
          </Link>
        </div>

        <nav className="app-sidebar-nav" aria-label="Main">
          <p className="app-sidebar-heading">Stacks</p>
          <ul className="app-sidebar-list">
            {PRIMARY_NAV.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} onNavigate={closeMobile} />
              </li>
            ))}
          </ul>

          <p className="app-sidebar-heading">Arcade</p>
          <ul className="app-sidebar-list">
            {ARCADE_NAV.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} onNavigate={closeMobile} />
              </li>
            ))}
          </ul>

          <p className="app-sidebar-heading">Library ops</p>
          <ul className="app-sidebar-list">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <SidebarLink item={item} onNavigate={closeMobile} />
              </li>
            ))}
          </ul>
        </nav>

        <div className="app-sidebar-foot">
          <button
            type="button"
            className="app-sidebar-collapse tip tip-right hidden lg:inline-flex"
            data-tip={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar ([)"}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={toggleCollapsed}
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4" aria-hidden />
            ) : (
              <PanelLeftClose className="h-4 w-4" aria-hidden />
            )}
            <span className="app-sidebar-label">Collapse</span>
          </button>
        </div>
      </aside>
    </>
  );
}
