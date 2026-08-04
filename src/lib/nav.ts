export type NavItem = {
  href: string;
  label: string;
  /** Short title for hover / mobile secondary line */
  tip: string;
};

/** Daily-use destinations — always visible in desktop header. */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    href: "/catalog",
    label: "Catalog",
    tip: "Search and browse holdings",
  },
  {
    href: "/graph",
    label: "Graph",
    tip: "3D knowledge map",
  },
  {
    href: "/collections",
    label: "Collections",
    tip: "Manual shelves",
  },
  {
    href: "/ask",
    label: "Ask",
    tip: "Talk to the Librarian",
  },
] as const;

/** Ops / help — desktop “More” menu; mobile secondary group. */
export const SECONDARY_NAV: readonly NavItem[] = [
  {
    href: "/locations",
    label: "Locations",
    tip: "Scan roots to index",
  },
  {
    href: "/services",
    label: "Services",
    tip: "Reindex & machine",
  },
  {
    href: "/docs",
    label: "Docs",
    tip: "Getting started",
  },
] as const;

/** Full list for footer and any flat consumers. */
export const MAIN_NAV: readonly NavItem[] = [
  ...PRIMARY_NAV,
  ...SECONDARY_NAV,
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSecondaryActive(pathname: string): boolean {
  return SECONDARY_NAV.some((item) => isNavActive(pathname, item.href));
}
