import type { ReactElement } from "react";
import type { NavIconName } from "@/lib/nav";

/**
 * Custom Helix nav glyphs — library + starlight, not Lucide.
 * 24 viewBox, 1.6 stroke, currentColor. Family trait: architectural
 * frames, round caps, a quiet helix/rung where it earns its keep.
 */
function GlyphSvg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="nav-icon-svg"
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

function CatalogGlyph() {
  return (
    <GlyphSvg>
      <rect x="4.4" y="5.8" width="15.2" height="13.6" rx="1.6" />
      <path d="M9.2 4.4h5.6c.5 0 .9.4.9.9v.5H8.3v-.5c0-.5.4-.9.9-.9Z" />
      <path d="M4.4 9.6h15.2" />
      <path d="M7.4 12.8h7.4" />
      <path d="M7.4 15.8h5.2" />
    </GlyphSvg>
  );
}

function GraphGlyph() {
  return (
    <GlyphSvg>
      <path d="M8.1 8.4 11.4 11.6" />
      <path d="M15.9 8.2 12.6 11.6" />
      <path d="M11.5 13.1 8.6 16.6" />
      <path d="M12.6 13.1 15.6 16.5" />
      <circle cx="7.2" cy="7.4" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="16.8" cy="7.2" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12.2" r="1.35" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="17.4" r="1.55" fill="currentColor" stroke="none" />
      <circle cx="16.4" cy="17.2" r="1.55" fill="currentColor" stroke="none" />
    </GlyphSvg>
  );
}

function CollectionsGlyph() {
  return (
    <GlyphSvg>
      <rect x="4.6" y="3.8" width="14.8" height="16.4" rx="1.5" />
      <path d="M4.6 9.2h14.8" />
      <path d="M4.6 14.6h14.8" />
      <path d="M7.2 11.2v2" />
      <path d="M9.6 10.8v2.4" />
      <path d="M12 11.3v1.8" />
    </GlyphSvg>
  );
}

function AskGlyph() {
  return (
    <GlyphSvg>
      <path d="M6.2 5.6h9.4A2.8 2.8 0 0 1 18.4 8.4v4.4a2.8 2.8 0 0 1-2.8 2.8h-3.4L8.2 19.2v-3.6H6.2A2.8 2.8 0 0 1 3.4 12.8V8.4A2.8 2.8 0 0 1 6.2 5.6Z" />
      <path d="m12 8.3-1.5 2.9h3L12 8.3Z" />
      <path d="M10.7 12.3h2.6" />
    </GlyphSvg>
  );
}

function LensGlyph() {
  return (
    <GlyphSvg>
      <circle cx="12" cy="12" r="7.4" />
      <circle cx="12" cy="12" r="2.7" />
      <path d="M12 4.6v1.8" />
      <path d="M12 17.6v1.8" />
      <path d="M4.6 12h1.8" />
      <path d="M17.6 12h1.8" />
      <path d="m7 7 1.1 1.1" />
      <path d="m15.9 15.9 1.1 1.1" />
    </GlyphSvg>
  );
}

function LocationsGlyph() {
  return (
    <GlyphSvg>
      <path d="M5.2 8.2h7.4l1.6 1.7H19a1.4 1.4 0 0 1 1.4 1.4v6.4A1.4 1.4 0 0 1 19 19.1H5.2A1.4 1.4 0 0 1 3.8 17.7V9.6A1.4 1.4 0 0 1 5.2 8.2Z" />
      <path d="M7.4 8.2V6.6A1.2 1.2 0 0 1 8.6 5.4h4.6l1.4 1.4h2.8" />
    </GlyphSvg>
  );
}

function AcquireGlyph() {
  return (
    <GlyphSvg>
      <path d="M12 3.8v9.2" />
      <path d="m8.4 9.4 3.6 3.6 3.6-3.6" />
      <path d="M5 15.2h14" />
      <path d="M6.4 15.2 5.4 19.4h13.2l-1-4.2" />
    </GlyphSvg>
  );
}

function ServicesGlyph() {
  return (
    <GlyphSvg>
      <rect x="5" y="4.2" width="14" height="4.2" rx="1.1" />
      <rect x="5" y="9.9" width="14" height="4.2" rx="1.1" />
      <rect x="5" y="15.6" width="14" height="4.2" rx="1.1" />
      <circle cx="8" cy="12" r="0.7" fill="currentColor" stroke="none" />
    </GlyphSvg>
  );
}

function DocsGlyph() {
  return (
    <GlyphSvg>
      <path d="M12 6.2c-2.2.5-4.8.3-6.4.6v11c1.8-.4 4.4.1 6.4.9 2-.8 4.6-1.3 6.4-.9v-11c-1.6-.3-4.2-.1-6.4-.6Z" />
      <path d="M12 6.2v12.5" />
      <path d="M8 9.4h2.2" />
      <path d="M8 12h2.2" />
      <path d="M13.8 9.4H16" />
      <path d="M13.8 12H16" />
    </GlyphSvg>
  );
}

function DesignGlyph() {
  return (
    <GlyphSvg>
      <rect x="4.4" y="4.4" width="6.4" height="6.4" rx="1.2" />
      <rect x="13.2" y="4.4" width="6.4" height="6.4" rx="1.2" />
      <rect x="4.4" y="13.2" width="6.4" height="6.4" rx="1.2" />
      <rect x="13.2" y="13.2" width="6.4" height="6.4" rx="1.2" />
      <path d="M15.2 14.6c.85.45 1.15 1 .8 1.55-.4.6-1.35.8-1.35 1.45 0 .65.95.85 1.35 1.45.35.55.05 1.1-.8 1.55" />
      <path d="M17.6 14.6c-.85.45-1.15 1-.8 1.55.4.6 1.35.8 1.35 1.45 0 .65-.95.85-1.35 1.45-.35.55-.05 1.1.8 1.55" />
    </GlyphSvg>
  );
}

const GLYPHS: Record<NavIconName, () => ReactElement> = {
  catalog: CatalogGlyph,
  graph: GraphGlyph,
  collections: CollectionsGlyph,
  ask: AskGlyph,
  lens: LensGlyph,
  locations: LocationsGlyph,
  acquire: AcquireGlyph,
  services: ServicesGlyph,
  docs: DocsGlyph,
  design: DesignGlyph,
};

export function NavGlyph({ name }: { name: NavIconName }) {
  const Glyph = GLYPHS[name];
  return <Glyph />;
}

export const NAV_GLYPH_NOTES: Record<NavIconName, string> = {
  catalog: "Card catalog drawer — holdings as cards",
  graph: "Constellation — holdings linked as a map",
  collections: "Bookcase — manual and smart shelves",
  ask: "Reference bubble with a lamp spark",
  lens: "Aperture — one holding under Deep Lens",
  locations: "Stacked folders — scan-root branches",
  acquire: "Incoming folio into the tray",
  services: "Workroom slabs — reindex, backup, restore",
  docs: "Open folio — the in-app handbook",
  design: "Swatch grid with a helix in the last cell",
};
