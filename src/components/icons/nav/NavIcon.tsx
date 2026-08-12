import type { CSSProperties, ReactElement } from "react";
import {
  BookOpen,
  Download,
  FolderOpen,
  HardDrive,
  Layers,
  LayoutGrid,
  MessageCircle,
  Network,
  Search,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { NavIconName } from "@/lib/nav";

export type { NavIconName };

/**
 * Same Lucide glyphs as the home service tiles
 * (`src/app/page.tsx` ServiceTile icons).
 */
const ICONS: Record<NavIconName, LucideIcon> = {
  catalog: Search,
  graph: Network,
  collections: Layers,
  ask: MessageCircle,
  locations: FolderOpen,
  acquire: Download,
  services: HardDrive,
  docs: BookOpen,
  design: LayoutGrid,
};

export function NavIcon({
  name,
  className,
  style,
}: {
  name: NavIconName;
  className?: string;
  /** Override size in design lab / special layouts. */
  style?: CSSProperties;
}) {
  const Icon = ICONS[name];
  return (
    <span
      className={cn("nav-icon", `nav-icon--${name}`, className)}
      style={style}
      aria-hidden
    >
      <Icon className="nav-icon-svg" strokeWidth={1.75} absoluteStrokeWidth />
    </span>
  );
}

/** For design lab listings that need the component type. */
export function navIconComponent(name: NavIconName): LucideIcon {
  return ICONS[name];
}

export function NavIconGlyph({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}): ReactElement {
  const Icon = ICONS[name];
  return <Icon className={className} strokeWidth={1.75} absoluteStrokeWidth />;
}
