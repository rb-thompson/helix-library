/**
 * Client-only quote bridge for Ask-about-selection (sessionStorage).
 * Server never trusts this as document body — only as untrusted user text.
 */

export const ASK_QUOTE_KEY = "helix-ask-quote";
/** sessionStorage may hold up to 2k; prompt appendix caps at 500. */
export const ASK_QUOTE_STORAGE_MAX = 2000;
export const ASK_QUOTE_PROMPT_MAX = 500;

export function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

export function writeAskQuote(quote: string): void {
  if (typeof window === "undefined") return;
  try {
    const cleaned = stripControlChars(quote).trim().slice(0, ASK_QUOTE_STORAGE_MAX);
    if (!cleaned) {
      sessionStorage.removeItem(ASK_QUOTE_KEY);
      return;
    }
    sessionStorage.setItem(ASK_QUOTE_KEY, cleaned);
  } catch {
    // private mode / quota
  }
}

export function readAskQuote(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ASK_QUOTE_KEY);
    if (!raw) return null;
    const cleaned = stripControlChars(raw).trim();
    return cleaned || null;
  } catch {
    return null;
  }
}

export function clearAskQuote(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(ASK_QUOTE_KEY);
  } catch {
    // ignore
  }
}

/** Short form safe for query string (URL length). */
export function quoteForUrl(quote: string, max = 180): string {
  const cleaned = stripControlChars(quote).trim().replace(/\s+/g, " ");
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1)}…`;
}

export function buildAskHoldingHref(
  itemId: number,
  quote?: string | null,
): string {
  const params = new URLSearchParams();
  params.set("item", String(itemId));
  if (quote?.trim()) {
    writeAskQuote(quote);
    params.set("quote", quoteForUrl(quote));
  }
  return `/ask?${params.toString()}`;
}
