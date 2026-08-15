import { ITEM_KINDS, type ItemKind } from "@/lib/types";

export type KindObjectMetaphor =
  | "vhs"
  | "cassette"
  | "paper"
  | "paper_stack"
  | "photo_print"
  | "floppy"
  | "crate"
  | "crate_muted";

export type KindObjectSpec = {
  kind: ItemKind;
  metaphor: KindObjectMetaphor;
  label: string;
  /** Short stage description for a11y / poster. */
  description: string;
  /** Prefer thumb texture when available. */
  preferThumb: boolean;
  /** Show title text on label area. */
  showTitleOnLabel: boolean;
};

const SPECS: Record<ItemKind, KindObjectSpec> = {
  video: {
    kind: "video",
    metaphor: "vhs",
    label: "VHS cassette",
    description: "Video holding as a VHS tape with poster label art.",
    preferThumb: true,
    showTitleOnLabel: true,
  },
  audio: {
    kind: "audio",
    metaphor: "cassette",
    label: "Audio cassette",
    description: "Audio holding as a compact cassette with title label.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
  text: {
    kind: "text",
    metaphor: "paper",
    label: "Note sheet",
    description: "Text holding as a single sheet of paper.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
  document: {
    kind: "document",
    metaphor: "paper_stack",
    label: "Document stack",
    description: "Document holding as a stack of papers.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
  image: {
    kind: "image",
    metaphor: "photo_print",
    label: "Photo print",
    description: "Image holding as a photo print in a thin frame.",
    preferThumb: true,
    showTitleOnLabel: false,
  },
  code: {
    kind: "code",
    metaphor: "floppy",
    label: "Floppy disk",
    description: "Code holding as a 3.5″ floppy disk.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
  archive: {
    kind: "archive",
    metaphor: "crate",
    label: "Sealed crate",
    description: "Archive holding as a sealed crate.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
  other: {
    kind: "other",
    metaphor: "crate_muted",
    label: "Unknown container",
    description: "Other holding as a muted sealed crate.",
    preferThumb: false,
    showTitleOnLabel: true,
  },
};

export function kindObjectSpec(kind: string): KindObjectSpec {
  if ((ITEM_KINDS as readonly string[]).includes(kind)) {
    return SPECS[kind as ItemKind];
  }
  return SPECS.other;
}

export function allKindObjectSpecs(): KindObjectSpec[] {
  return ITEM_KINDS.map((k) => SPECS[k]);
}
