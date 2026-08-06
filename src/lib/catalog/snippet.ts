export type MatchField = "name" | "title" | "path" | "body";

export type SearchSnippet = {
  snippet: string;
  matchField: MatchField;
};

const DEFAULT_MAX = 200;

function firstTokenIndex(haystack: string, tokens: string[]): number {
  const lower = haystack.toLowerCase();
  let best = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (best < 0 || i < best)) best = i;
  }
  return best;
}

function windowAround(text: string, index: number, maxLen: number): string {
  if (text.length <= maxLen) return text.replace(/\s+/g, " ").trim();
  const half = Math.floor(maxLen / 2);
  let start = Math.max(0, index - half);
  const end = Math.min(text.length, start + maxLen);
  if (end - start < maxLen) start = Math.max(0, end - maxLen);
  // Prefer word boundaries a bit
  if (start > 0) {
    const sp = text.indexOf(" ", start);
    if (sp > start && sp < start + 24) start = sp + 1;
  }
  let out = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) out = `…${out}`;
  if (end < text.length) out = `${out}…`;
  return out;
}

/**
 * Build a short snippet explaining why a holding matched `tokens`.
 * Prefers name → title → path → body (first hit wins).
 */
export function buildSearchSnippet(
  tokens: string[],
  fields: {
    name: string;
    title: string;
    relPath: string;
    body?: string | null;
  },
  maxLen = DEFAULT_MAX,
): SearchSnippet | null {
  if (!tokens.length) return null;

  const nameIdx = firstTokenIndex(fields.name, tokens);
  if (nameIdx >= 0) {
    return {
      matchField: "name",
      snippet: windowAround(fields.name, nameIdx, maxLen),
    };
  }

  const titleIdx = firstTokenIndex(fields.title, tokens);
  if (titleIdx >= 0 && fields.title !== fields.name) {
    return {
      matchField: "title",
      snippet: windowAround(fields.title, titleIdx, maxLen),
    };
  }

  const pathIdx = firstTokenIndex(fields.relPath, tokens);
  if (pathIdx >= 0) {
    return {
      matchField: "path",
      snippet: windowAround(fields.relPath, pathIdx, maxLen),
    };
  }

  const body = fields.body?.trim();
  if (body) {
    const bodyIdx = firstTokenIndex(body, tokens);
    if (bodyIdx >= 0) {
      return {
        matchField: "body",
        snippet: windowAround(body, bodyIdx, maxLen),
      };
    }
  }

  return null;
}

/**
 * Split text into plain / highlight segments for React rendering (no HTML).
 */
export function highlightSegments(
  text: string,
  tokens: string[],
): Array<{ text: string; hit: boolean }> {
  if (!text || !tokens.length) return [{ text, hit: false }];

  const unique = [...new Set(tokens.map((t) => t.toLowerCase()).filter(Boolean))];
  if (!unique.length) return [{ text, hit: false }];

  // Escape for regex; match longest first to avoid partial splits
  const sorted = [...unique].sort((a, b) => b.length - a.length);
  const re = new RegExp(
    `(${sorted.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
    "gi",
  );

  const parts: Array<{ text: string; hit: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ text: text.slice(last, m.index), hit: false });
    }
    parts.push({ text: m[0], hit: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ text: text.slice(last), hit: false });
  }
  return parts.length ? parts : [{ text, hit: false }];
}
