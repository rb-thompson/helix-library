/** Glyph key for Helix nav icons (`NavIcon` — Lucide). */
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
  | "design"
  | "arcade";

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
  "arcade",
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

/** After-hours cabinet — not stacks, not ops. */
export const ARCADE_HUB: NavItem = {
  href: "/arcade",
  label: "Arcade",
  tip: "After-hours games on the grounds",
  icon: "arcade",
};

/** Games listed under the Arcade heading. */
export const ARCADE_NAV: readonly NavItem[] = [
  {
    href: "/arcade/night-moth",
    label: "Night Moth",
    tip: "3D voxel night flight — not every lamp is kind",
    icon: "arcade",
  },
] as const;

/** Internal lab — reachable by URL, not a public desk. */
export const DESIGN_NAV_ITEM: NavItem = {
  href: "/design",
  label: "Design",
  tip: "Icons, spinner, tokens lab",
  icon: "design",
};

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
] as const;

/** Full list for footer and any flat consumers. */
export const MAIN_NAV: readonly NavItem[] = [
  ...PRIMARY_NAV,
  ARCADE_HUB,
  ...SECONDARY_NAV,
] as const;

export function isNavActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isSecondaryActive(pathname: string): boolean {
  return SECONDARY_NAV.some((item) => isNavActive(pathname, item.href));
}

export function isArcadeActive(pathname: string): boolean {
  return (
    isNavActive(pathname, ARCADE_HUB.href) ||
    ARCADE_NAV.some((item) => isNavActive(pathname, item.href))
  );
}
