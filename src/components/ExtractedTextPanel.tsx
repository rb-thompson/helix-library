"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";

const PREVIEW_CHARS = 1200;

/**
 * Shows the FTS body sample (notes, code, PDF text layer) on item detail.
 */
export function ExtractedTextPanel({
  body,
  kindLabel = "Extracted text",
}: {
  body: string;
  kindLabel?: string;
}) {
  const [open, setOpen] = useState(true);
  const empty = !body.trim();
  const truncated = body.length > PREVIEW_CHARS;
  const shown = truncated ? body.slice(0, PREVIEW_CHARS) : body;

  return (
    <div className="surface sm:rounded-2xl">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-6 sm:py-4"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          <FileSearch className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          {kindLabel}
        </span>
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-faint)]" aria-hidden />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--muted-faint)]" aria-hidden />
        )}
      </button>
      {open ? (
        <div className="border-t border-[var(--line)] px-4 pb-4 sm:px-6 sm:pb-6">
          {empty ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              No searchable text was extracted (scanned image-only PDF, empty
              file, or extraction failed). Filename and path still match in
              search.
            </p>
          ) : (
            <>
              <pre className="surface-inset mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-[var(--ink-soft)] sm:text-sm">
                {shown}
                {truncated ? "…" : ""}
              </pre>
              <p className="mt-2 text-xs text-[var(--muted)]">
                {truncated
                  ? `Showing first ${PREVIEW_CHARS.toLocaleString()} characters of the indexed sample. `
                  : ""}
                This text is used for full-text search in the catalog.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
