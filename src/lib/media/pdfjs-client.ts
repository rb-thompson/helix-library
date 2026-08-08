/**
 * Browser-only PDF.js loader.
 *
 * Do NOT `import("pdfjs-dist")` through webpack — Next SSR/client bundling
 * corrupts pdf.mjs (Object.defineProperty / broken init). Serve the stock
 * build from /public and import with webpackIgnore.
 *
 * Files (pin 5.4.296, match package.json):
 *   public/pdf.min.mjs
 *   public/pdf.worker.min.mjs
 */

const PDF_MAIN = "/pdf.min.mjs";
const PDF_WORKER = "/pdf.worker.min.mjs";

/** Loose shape — avoid importing pdfjs-dist types into the SSR graph. */
export type PdfjsClient = {
  getDocument: (src: unknown) => {
    promise: Promise<PdfDocument>;
    destroy: () => Promise<void>;
  };
  GlobalWorkerOptions: { workerSrc: string; workerPort?: Worker | null };
  TextLayer: new (opts: {
    textContentSource: unknown;
    container: HTMLElement;
    viewport: PdfViewport;
  }) => { render: () => Promise<unknown>; cancel?: () => void };
  /** PDF.js 5: sizes layers with --total-scale-factor * page dims */
  setLayerDimensions?: (
    div: HTMLElement,
    viewport: PdfViewport,
    mustFlip?: boolean,
    mustRotate?: boolean,
  ) => void;
  version?: string;
};

export type PdfViewport = {
  width: number;
  height: number;
  scale: number;
  rotation: number;
  rawDims?: {
    pageWidth: number;
    pageHeight: number;
    pageX?: number;
    pageY?: number;
  };
};

export type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
  destroy: () => Promise<void>;
};

export type PdfPage = {
  getViewport: (opts: { scale: number }) => PdfViewport;
  render: (opts: {
    canvas: HTMLCanvasElement | null;
    canvasContext?: CanvasRenderingContext2D;
    viewport: PdfViewport;
    transform?: number[];
  }) => { promise: Promise<void> };
  getTextContent: () => Promise<unknown>;
};

/**
 * Align page container CSS vars with PDF.js 5 text-layer layout.
 * Missing --scale-factor makes selection drift (often worse on the right).
 */
export function applyPdfPageScale(
  pageEl: HTMLElement,
  viewport: PdfViewport,
): void {
  const scale = viewport.scale;
  pageEl.style.setProperty("--scale-factor", String(scale));
  pageEl.style.setProperty("--user-unit", "1");
  pageEl.style.setProperty("--total-scale-factor", String(scale));
  pageEl.style.setProperty("--scale-round-x", "1px");
  pageEl.style.setProperty("--scale-round-y", "1px");
  // Exact CSS pixel box matching the canvas draw target
  const w = Math.floor(viewport.width);
  const h = Math.floor(viewport.height);
  pageEl.style.width = `${w}px`;
  pageEl.style.height = `${h}px`;
}

let cached: PdfjsClient | null = null;
let loading: Promise<PdfjsClient> | null = null;

function resolveNamespace(mod: unknown): PdfjsClient {
  const m = mod as PdfjsClient & { default?: PdfjsClient };
  if (m && typeof m.getDocument === "function" && m.GlobalWorkerOptions) {
    return m;
  }
  if (
    m?.default &&
    typeof m.default.getDocument === "function" &&
    m.default.GlobalWorkerOptions
  ) {
    return m.default;
  }
  throw new Error(
    "PDF.js public build missing getDocument/GlobalWorkerOptions — re-copy public/pdf.min.mjs from pdfjs-dist@5.4.296",
  );
}

/**
 * Load PDF.js once per page session (client only).
 */
export async function loadPdfjs(): Promise<PdfjsClient> {
  if (typeof window === "undefined") {
    throw new Error("PDF.js is browser-only");
  }
  if (cached) return cached;
  if (loading) return loading;

  loading = (async () => {
    // webpackIgnore: leave the public ESM alone — critical for Next 15.
    const mod = await import(
      /* webpackIgnore: true */
      /* @vite-ignore */
      PDF_MAIN
    );
    const pdfjs = resolveNamespace(mod);
    pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    cached = pdfjs;
    return pdfjs;
  })();

  try {
    return await loading;
  } catch (err) {
    loading = null;
    throw err;
  }
}

export function pdfjsPublicPaths() {
  return { main: PDF_MAIN, worker: PDF_WORKER };
}
