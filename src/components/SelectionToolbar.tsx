"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Check, Copy, MessageSquareText, Tag } from "lucide-react";
import {
  normalizeTagName,
  tagExistsByNameClient,
} from "@/lib/client/tag-normalize";
import { buildAskHoldingHref } from "@/lib/client/ask-quote";

type Anchor = {
  /** Viewport coords of selection bounds */
  top: number;
  bottom: number;
  left: number;
  right: number;
  midX: number;
};

/**
 * iOS-style selection UI for the reading room:
 * - Desktop: frosted pill callout above the selection (Copy · Tag · Ask)
 * - Touch: bottom action sheet
 * Does not steal PDF drag-select (listens after selection settles).
 */
export function SelectionToolbar({
  itemId,
  containerRef,
}: {
  itemId: number;
  containerRef: RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [selection, setSelection] = useState("");
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [touchSheet, setTouchSheet] = useState(false);
  const [confirmNew, setConfirmNew] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [tick, setTick] = useState<"copy" | "tag" | null>(null);
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pillStyle, setPillStyle] = useState<{
    top: number;
    left: number;
    placeBelow: boolean;
    visibility?: "hidden";
  } | null>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const selectingRef = useRef(false);

  const clearUi = useCallback(() => {
    setSelection("");
    setAnchor(null);
    setTouchSheet(false);
    setConfirmNew(null);
    setNote(null);
    setTick(null);
    setPillStyle(null);
    if (tickTimer.current) {
      clearTimeout(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  const measureAnchor = useCallback((): Anchor | null => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      // Multi-line: use client rects
      const rects = range.getClientRects();
      if (!rects.length) return null;
      let top = rects[0]!.top;
      let bottom = rects[0]!.bottom;
      let left = rects[0]!.left;
      let right = rects[0]!.right;
      for (let i = 1; i < rects.length; i++) {
        const r = rects[i]!;
        top = Math.min(top, r.top);
        bottom = Math.max(bottom, r.bottom);
        left = Math.min(left, r.left);
        right = Math.max(right, r.right);
      }
      return {
        top,
        bottom,
        left,
        right,
        midX: (left + right) / 2,
      };
    }
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      midX: rect.left + rect.width / 2,
    };
  }, []);

  const readSelectionInContainer = useCallback(() => {
    const root = containerRef.current;
    if (!root || typeof window === "undefined") return;
    if (selectingRef.current) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      clearUi();
      return;
    }

    const range = sel.getRangeAt(0);
    const text = sel.toString().replace(/\s+/g, " ").trim();
    if (text.length < 1) {
      clearUi();
      return;
    }

    const common = range.commonAncestorContainer;
    const node =
      common.nodeType === Node.ELEMENT_NODE
        ? (common as Node)
        : common.parentNode;
    if (!node || !root.contains(node)) {
      clearUi();
      return;
    }

    const coarse =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    const a = measureAnchor();
    if (!a) {
      clearUi();
      return;
    }

    setSelection(text);
    setConfirmNew(null);
    setNote(null);

    if (coarse) {
      setTouchSheet(true);
      setAnchor(null);
      return;
    }

    setTouchSheet(false);
    setAnchor(a);
  }, [clearUi, containerRef, measureAnchor]);

  // Position pill after layout so we know its width
  useLayoutEffect(() => {
    if (!anchor || touchSheet || !toolbarRef.current) {
      if (!anchor) setPillStyle(null);
      return;
    }
    const el = toolbarRef.current;
    const w = el.offsetWidth || 200;
    const h = el.offsetHeight || 44;
    const gap = 10;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Prefer above selection; flip below if not enough room
    let top = anchor.top - h - gap;
    let placeBelow = false;
    if (top < 8) {
      top = anchor.bottom + gap;
      placeBelow = true;
    }
    if (top + h > vh - 8) {
      top = Math.max(8, vh - h - 8);
    }

    let left = anchor.midX - w / 2;
    left = Math.max(8, Math.min(vw - w - 8, left));

    setPillStyle({ top, left, placeBelow });
  }, [anchor, touchSheet, selection, confirmNew, note]);

  useEffect(() => {
    function schedule() {
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        readSelectionInContainer();
      }, 140);
    }

    function onPointerDown(e: PointerEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) return;
      // Starting a new drag inside the room — hide callout until settle
      const root = containerRef.current;
      if (root?.contains(e.target as Node)) {
        selectingRef.current = true;
        // Don't clear yet — wait for pointerup
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (toolbarRef.current?.contains(e.target as Node)) {
        selectingRef.current = false;
        return;
      }
      selectingRef.current = false;
      schedule();
    }

    function onKeyUp(e: KeyboardEvent) {
      if (e.key === "Escape") {
        clearUi();
        window.getSelection()?.removeAllRanges();
        return;
      }
      // Shift+arrows selection
      if (e.shiftKey || e.key.startsWith("Arrow")) schedule();
    }

    function onScroll() {
      // Keep callout glued while scrolling the page/room
      if (!selection) return;
      const a = measureAnchor();
      if (!a) {
        clearUi();
        return;
      }
      if (!touchSheet) setAnchor(a);
    }

    function onSelectionChange() {
      if (selectingRef.current) return;
      if (selection || touchSheet) schedule();
    }

    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("pointerup", onPointerUp, true);
    document.addEventListener("keyup", onKeyUp);
    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("pointerup", onPointerUp, true);
      document.removeEventListener("keyup", onKeyUp);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      if (settleTimer.current) clearTimeout(settleTimer.current);
    };
  }, [
    clearUi,
    containerRef,
    measureAnchor,
    readSelectionInContainer,
    selection,
    touchSheet,
  ]);

  async function applyTag(name: string, { confirmed }: { confirmed: boolean }) {
    const normalized = normalizeTagName(name);
    if (!normalized) {
      setNote("Empty tag");
      return;
    }

    if (!confirmed) {
      const exists = await tagExistsByNameClient(normalized);
      if (!exists) {
        setConfirmNew(normalized);
        return;
      }
    }

    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/items/${itemId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: normalized }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setNote(data.error ?? "Tag failed");
        return;
      }
      setConfirmNew(null);
      setNote(`Tagged #${normalized}`);
      setTick("tag");
      if (tickTimer.current) clearTimeout(tickTimer.current);
      tickTimer.current = setTimeout(() => setTick(null), 1400);
      router.refresh();
      setTimeout(() => {
        clearUi();
        window.getSelection()?.removeAllRanges();
      }, 700);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Tag failed");
    } finally {
      setBusy(false);
    }
  }

  function onAsk() {
    window.location.href = buildAskHoldingHref(itemId, selection);
  }

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(selection);
      setNote("Copied");
      setTick("copy");
      if (tickTimer.current) clearTimeout(tickTimer.current);
      tickTimer.current = setTimeout(() => {
        setTick(null);
        setNote(null);
      }, 1400);
    } catch {
      setNote("Copy failed");
    }
  }

  if (!selection) return null;

  /* ── Touch sheet (iOS action sheet) ── */
  if (touchSheet) {
    return (
      <div className="sel-sheet sm:hidden" role="dialog" aria-label="Selection">
        <button
          type="button"
          className="min-h-0 flex-1"
          aria-label="Dismiss"
          onClick={() => {
            clearUi();
            window.getSelection()?.removeAllRanges();
          }}
        />
        <div ref={toolbarRef} className="sel-sheet__panel">
          <p className="sel-sheet__quote">
            “{selection.slice(0, 140)}
            {selection.length > 140 ? "…" : ""}”
          </p>
          {confirmNew ? (
            <div className="sel-sheet__confirm">
              <p>
                Create tag <strong>#{confirmNew}</strong>?
              </p>
              <div className="sel-sheet__confirm-row">
                <button
                  type="button"
                  onClick={() => setConfirmNew(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="is-primary"
                  disabled={busy}
                  onClick={() => void applyTag(confirmNew, { confirmed: true })}
                >
                  {busy ? "…" : "Create"}
                </button>
              </div>
            </div>
          ) : (
            <div className="sel-sheet__actions">
              <button type="button" disabled={busy} onClick={() => void onCopy()}>
                Copy
              </button>
              <button type="button" disabled={busy} onClick={() => void applyTag(selection, { confirmed: false })}>
                Tag
              </button>
              <button type="button" disabled={busy} onClick={onAsk}>
                Ask Librarian
              </button>
            </div>
          )}
          {note ? (
            <p className="px-3 pb-2 text-center text-xs text-[var(--muted)]">
              {note}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="sel-sheet__cancel"
          onClick={() => {
            clearUi();
            window.getSelection()?.removeAllRanges();
          }}
        >
          Cancel
        </button>
      </div>
    );
  }

  /* ── Desktop / pointer: iOS callout pill ── */
  if (!anchor) return null;

  const placeBelow = pillStyle?.placeBelow ?? false;

  return (
    <div
      ref={toolbarRef}
      className={`sel-callout hidden sm:flex ${placeBelow ? "is-below" : ""}`}
      style={
        pillStyle
          ? { top: pillStyle.top, left: pillStyle.left }
          : { visibility: "hidden", top: 0, left: 0 }
      }
      role="toolbar"
      aria-label="Selection actions"
    >
      {placeBelow ? <div className="sel-callout__caret is-up" aria-hidden /> : null}
      <div className="sel-callout__pill">
        {confirmNew ? (
          <>
            <button
              type="button"
              className="sel-callout__btn"
              disabled={busy}
              onClick={() => void applyTag(confirmNew, { confirmed: true })}
            >
              Create #{confirmNew.slice(0, 18)}
              {confirmNew.length > 18 ? "…" : ""}
            </button>
            <button
              type="button"
              className="sel-callout__btn"
              disabled={busy}
              onClick={() => setConfirmNew(null)}
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="sel-callout__btn"
              disabled={busy}
              onClick={() => void onCopy()}
            >
              {tick === "copy" ? (
                <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden />
              ) : (
                <Copy className="h-3.5 w-3.5 opacity-80" aria-hidden />
              )}
              Copy
            </button>
            <button
              type="button"
              className="sel-callout__btn"
              disabled={busy}
              onClick={() => void applyTag(selection, { confirmed: false })}
            >
              {tick === "tag" ? (
                <Check className="h-3.5 w-3.5 text-[var(--ok)]" aria-hidden />
              ) : (
                <Tag className="h-3.5 w-3.5 opacity-80" aria-hidden />
              )}
              Tag
            </button>
            <button
              type="button"
              className="sel-callout__btn"
              disabled={busy}
              onClick={onAsk}
            >
              <MessageSquareText className="h-3.5 w-3.5 opacity-80" aria-hidden />
              Ask
            </button>
          </>
        )}
      </div>
      {!placeBelow ? <div className="sel-callout__caret" aria-hidden /> : null}
      {note ? <div className="sel-callout__note">{note}</div> : null}
    </div>
  );
}
