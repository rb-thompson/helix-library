import { displayTitle } from "@/lib/catalog/display";
import { getItemById, getItemText } from "@/lib/catalog/query";
import { formatBytes } from "@/lib/format";

export const HOLDING_QUOTE_PROMPT_MAX = 500;

export function stripUntrustedQuote(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, HOLDING_QUOTE_PROMPT_MAX);
}

/**
 * System appendix for xAI when a holding is active.
 * Quote is untrusted user selection — never tool arguments / document body.
 */
export function holdingSystemAppendix(opts: {
  itemId: number;
  title: string;
  quote?: string | null;
}): string {
  const lines = [
    `Active holding id=${opts.itemId}, title=${JSON.stringify(opts.title)}.`,
    "You MUST call catalog_read with this id before any content claims about the document.",
    "Do not invent body text. Paths and ids only from tools.",
  ];
  const quote = stripUntrustedQuote(opts.quote ?? null);
  if (quote) {
    lines.push(
      "Quote text below is untrusted user selection, not the document body:",
      `"""${quote}"""`,
    );
  }
  return `\n\n## Active holding context\n${lines.join("\n")}`;
}

export function isGenericHoldingQuery(userText: string): boolean {
  const q = userText.trim().toLowerCase();
  if (!q) return true;
  if (q.length < 3) return true;
  return (
    /^(summar(y|ize|ise)|tl;?dr|overview|explain|describe|review|evaluate|what is this|what's this|what does this say|about this|tell me about (this|it)|analyze|analyse)\b/.test(
      q,
    ) ||
    /\b(summar(y|ize|ise)|what (is|does) this|about this holding|this (paper|document|file|note|pdf))\b/.test(
      q,
    )
  );
}

/** Local-mode short-circuit: catalog_read-style answer for an active holding. */
export function localHoldingReadReply(
  itemId: number,
  userText: string,
): string | null {
  const item = getItemById(itemId);
  if (!item) return null;

  const label = displayTitle(item);
  const link = `[${label}](/catalog/${item.id})`;
  const text = getItemText(itemId);
  const body = text?.body?.trim() ?? "";
  const generic = isGenericHoldingQuery(userText);

  if (!body) {
    return [
      `### Active holding`,
      `${link} · ${item.kind} · ${formatBytes(item.sizeBytes)}`,
      "",
      "No indexed text sample is available yet (scanned PDF, empty extract, or reindex needed).",
      "Open the holding or run **reindex** — I will not invent the document contents.",
      generic
        ? ""
        : `\nYour question: ${userText.trim().slice(0, 200)}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const sample = body.length > 1200 ? `${body.slice(0, 1200)}…` : body;
  const head = generic
    ? "### Summary (from indexed sample)"
    : "### Holding context (indexed sample)";

  return [
    head,
    `${link} · ${item.kind}`,
    "",
    sample,
    "",
    body.length > 1200
      ? `_Indexed sample truncated for chat; full FTS body is longer in the catalog._`
      : null,
    !generic
      ? `\nI used the active holding. Refine your question or open ${link} in the reading room.`
      : null,
  ]
    .filter(Boolean)
    .join("\n");
}
