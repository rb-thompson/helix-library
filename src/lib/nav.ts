/** Glyph key for custom Helix nav icons (`NavIcon`). */
export type NavIconName =
  | "catalog"
  | "graph"
  | "collections"
  | "ask"
  | "lens"
  | "locations"
  | "acquire"
  | "services"
  | "docs"
  | "design";

/** Ordered list for design lab / registries. */
export const NAV_ICON_NAMES: readonly NavIconName[] = [
  "catalog",
  "graph",
  "collections",
  "ask",
  "lens",
  "locations",
  "acquire",
  "services",
  "docs",
  "design",
] as const;

export type NavItem = {
  href: string;
  label: string;
  /** Short title for hover / mobile secondary line */
  tip: string;
  /** Custom Helix nav glyph */
  icon: NavIconName;
};

/** Daily-use destinations — top of the left sidebar. */
export const PRIMARY_NAV: readonly NavItem[] = [
  {
    href: "/catalog",
    label: "Catalog",
    tip: "Search and browse holdings",
    icon: "catalog",
  },
  {
    href: "/graph",
    label: "Graph",
    tip: "2D/3D knowledge map",
    icon: "graph",
  },
  {
    href: "/collections",
    label: "Collections",
    tip: "Manual & smart shelves",
    icon: "collections",
  },
  {
    href: "/ask",
    label: "Ask",
    tip: "Talk to the Librarian",
    icon: "ask",
  },
  {
    href: "/lens",
    label: "Deep Lens",
    tip: "Active knowledge surface for one holding",
    icon: "lens",
  },
] as const;

/** Ops / help — lower group in the left sidebar. */
export const SECONDARY_NAV: readonly NavItem[] = [
  {
    href: "/locations",
    label: "Locations",
    tip: "Scan roots to index",
    icon: "locations",
  },
  {
    href: "/acquire",
    label: "Acquire",
    tip: "Pull papers, media, images into holdings",
    icon: "acquire",
  },
  {
    href: "/services",
    label: "Services",
    tip: "Reindex, backup & restore",
    icon: "services",
  },
  {
    href: "/docs",
    label: "Docs",
    tip: "Getting started",
    icon: "docs",
  },
  {
    href: "/design",
    label: "Design",
    tip: "Icons, spinner, tokens lab",
    icon: "design",
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
