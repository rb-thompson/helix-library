import type { CSSProperties, ReactElement } from "react";
import { cn } from "@/lib/cn";
import type { NavIconName } from "@/lib/nav";
import { NavGlyph } from "./glyphs";

export type { NavIconName };

/**
 * Custom Helix nav glyphs (library + starlight).
 * Shared by the left rail, home service tiles, and /docs map.
 */
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
  return (
    <span
      className={cn("nav-icon", `nav-icon--${name}`, className)}
      style={style}
      aria-hidden
    >
      <NavGlyph name={name} />
    </span>
  );
}

export function NavIconGlyph({
  name,
  className,
}: {
  name: NavIconName;
  className?: string;
}): ReactElement {
  return (
    <span className={cn("nav-icon-glyph", className)}>
      <NavGlyph name={name} />
    </span>
  );
}
