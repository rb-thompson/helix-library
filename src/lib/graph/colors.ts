/**
 * Knowledge graph palette — retro terminal phosphors, not pastels.
 * Aligns with Helix space chrome (cool monochrome + sparse accent).
 */

export type GraphTheme = "dark" | "light";

/** Holding kinds — CRT-ish hues, desaturated enough for the site. */
export const KIND_COLORS: Record<GraphTheme, Record<string, string>> = {
  dark: {
    text: "#4db8d4",
    image: "#9b7fd4",
    video: "#d45a8c",
    audio: "#d4a03a",
    archive: "#8a8680",
    code: "#3cb87a",
    document: "#5a9ad4",
    other: "#7a8494",
  },
  light: {
    // Deeper inks so nodes read on pale paper (pastels washed out badly)
    text: "#0a6a8a",
    image: "#5a3aa8",
    video: "#a01858",
    audio: "#8a5a00",
    archive: "#4a4844",
    code: "#0a6a42",
    document: "#1a4a9a",
    other: "#3a4250",
  },
};

export const CONCEPT_COLORS: Record<
  GraphTheme,
  { tag: string; collection: string; kind: string; location: string }
> = {
  dark: {
    tag: "#c9a227", // amber terminal
    collection: "#7a8fd4", // cool indigo, not pastel
    kind: "#9aa3b2",
    location: "#2a9a82", // teal phosphor
  },
  light: {
    tag: "#8a6800",
    collection: "#3a4a9a",
    kind: "#4a5260",
    location: "#0a6a56",
  },
};

export function graphBackground(theme: GraphTheme): string {
  /* Light matches --paper-deep (#e8e2d6). Do not use ivory --paper. */
  return theme === "dark" ? "#08090c" : "#e8e2d6";
}

export function graphDimNode(theme: GraphTheme): string {
  return theme === "dark" ? "rgba(70,78,90,0.22)" : "rgba(120,128,140,0.28)";
}

export function graphFocusColor(theme: GraphTheme): string {
  return theme === "dark" ? "#eef0f4" : "#0c0e12";
}

export function graphLabelFg(theme: GraphTheme): string {
  return theme === "dark" ? "#e8ecf2" : "#0c0e12";
}

export function graphLabelBg(theme: GraphTheme): string {
  return theme === "dark" ? "rgba(8,9,12,0.82)" : "rgba(255,255,255,0.9)";
}

export function graphLinkColor(
  theme: GraphTheme,
  relation: string,
  lit: boolean,
  dimmed: boolean,
): string {
  if (dimmed) {
    return theme === "dark"
      ? "rgba(90,100,120,0.07)"
      : "rgba(60,70,90,0.08)";
  }
  const a = lit ? 0.75 : theme === "dark" ? 0.42 : 0.38;
  if (relation === "tagged") {
    return theme === "dark"
      ? `rgba(201,162,39,${a})`
      : `rgba(138,104,0,${a})`;
  }
  if (relation === "shelved") {
    return theme === "dark"
      ? `rgba(122,143,212,${a})`
      : `rgba(58,74,154,${a})`;
  }
  if (relation === "located_in") {
    return theme === "dark"
      ? `rgba(42,154,130,${a * 0.85})`
      : `rgba(10,106,86,${a})`;
  }
  // kind_of / default — starlight accent
  return theme === "dark"
    ? `rgba(180,190,210,${lit ? 0.45 : 0.22})`
    : `rgba(40,48,64,${lit ? 0.4 : 0.2})`;
}

export function graphParticleColor(
  theme: GraphTheme,
  relation: string,
): string {
  if (relation === "tagged") {
    return theme === "dark" ? "#c9a227" : "#8a6800";
  }
  if (relation === "shelved") {
    return theme === "dark" ? "#7a8fd4" : "#3a4a9a";
  }
  return theme === "dark" ? "#a8b0c0" : "#4a5260";
}

/** Resolve a node's display color for the active theme. */
export function nodeColorForTheme(
  theme: GraphTheme,
  type: string,
  kind?: string | null,
): string {
  if (type === "item") {
    const k = kind && KIND_COLORS[theme][kind] ? kind : "other";
    return KIND_COLORS[theme][k] ?? KIND_COLORS[theme].other;
  }
  if (type === "tag") return CONCEPT_COLORS[theme].tag;
  if (type === "collection") return CONCEPT_COLORS[theme].collection;
  if (type === "kind") return CONCEPT_COLORS[theme].kind;
  if (type === "location") return CONCEPT_COLORS[theme].location;
  return KIND_COLORS[theme].other;
}

/** Legend samples for the toolbar (theme-aware). */
export function legendSamples(theme: GraphTheme): Array<{ color: string; label: string }> {
  return [
    { color: KIND_COLORS[theme].image, label: "Image" },
    { color: KIND_COLORS[theme].document, label: "Doc" },
    { color: KIND_COLORS[theme].code, label: "Code" },
    { color: CONCEPT_COLORS[theme].tag, label: "Tag" },
    { color: CONCEPT_COLORS[theme].collection, label: "Shelf" },
  ];
}
