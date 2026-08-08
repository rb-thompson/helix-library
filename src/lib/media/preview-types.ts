/**
 * Media preview union — types only (safe for client imports).
 * Runtime loaders stay in preview.ts (server).
 */
export type MediaPreview =
  | { type: "image"; src: string }
  | { type: "video"; src: string; mime: string | null }
  | { type: "audio"; src: string; mime: string | null }
  | { type: "pdf"; src: string }
  | { type: "text"; text: string; truncated: boolean }
  | { type: "none"; reason: string };
