import { writeFile } from "node:fs/promises";
import {
  assertSafeOutboundUrl,
  fetchSafeOutbound,
} from "@/lib/acquire/outbound";
import { safeArchivePath, slugify } from "@/lib/acquire/paths";
import { indexAfterAcquire } from "@/lib/acquire/index-after";
import { setItemCatalogTitle } from "@/lib/catalog/query";
import { addTagToItem } from "@/lib/collections/manage";
import { valueToTagName } from "@/lib/acquire/auto-tags";
import { isCancelRequested } from "@/lib/jobs/store";

const CLIP_MAX_BYTES = 2 * 1024 * 1024;
const CLIP_TIMEOUT_MS = 30_000;
const MIN_BODY_CHARS = 80;

export type ClipAcquireResult = {
  path: string;
  relPath: string;
  title: string;
  sourceUrl: string;
  bytes: number;
  itemId: number | null;
  tags?: string[];
};

type ProgressCb = (p: {
  stage: string;
  percent: number | null;
  detail?: string;
}) => void;

export function isAllowedClipUrl(url: string): boolean {
  try {
    assertSafeOutboundUrl(url, { httpsOnly: false });
    return true;
  } catch {
    return false;
  }
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCodePoint(parseInt(h, 16)),
    )
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&hellip;/g, "…");
}

function stripBlocks(html: string): string {
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  const blockTags = [
    "script",
    "style",
    "noscript",
    "svg",
    "iframe",
    "template",
  ];
  for (const tag of blockTags) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    s = s.replace(re, " ");
  }
  return s;
}

function metaContent(html: string, attr: string, value: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']+)["']`,
    "i",
  );
  const m = html.match(re);
  if (m) return decodeEntities(m[1].trim());
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`,
    "i",
  );
  const m2 = html.match(re2);
  return m2 ? decodeEntities(m2[1].trim()) : null;
}

function extractTitle(html: string, baseUrl: string): string {
  const og = metaContent(html, "property", "og:title");
  if (og) return og;
  const tw = metaContent(html, "name", "twitter:title");
  if (tw) return tw;
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) {
    const title = decodeEntities(t[1].replace(/\s+/g, " ").trim());
    if (title) return title;
  }
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return "Untitled clip";
  }
}

function selectBodyRoot(html: string): string {
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return article[1];
  const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) return main[1];
  const roleMain = html.match(
    /<([a-z0-9]+)[^>]*\brole=["']main["'][^>]*>([\s\S]*?)<\/\1>/i,
  );
  if (roleMain) return roleMain[2];
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  if (body) return body[1];
  return html;
}

function removeNoiseTags(html: string): string {
  let s = html;
  for (const tag of ["nav", "footer", "aside", "form"]) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, "gi");
    s = s.replace(re, " ");
  }
  // header — only if there is substantial content besides headers
  const withoutHeader = s.replace(
    /<header\b[^>]*>[\s\S]*?<\/header>/gi,
    " ",
  );
  if (withoutHeader.replace(/<[^>]+>/g, " ").trim().length >= MIN_BODY_CHARS) {
    s = withoutHeader;
  }
  return s;
}

function absUrl(href: string, baseUrl: string): string {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return href;
  }
}

type Tok =
  | { kind: "text"; text: string }
  | { kind: "open"; tag: string; attrs: string }
  | { kind: "close"; tag: string }
  | { kind: "void"; tag: string; attrs: string };

function tokenize(html: string): Tok[] {
  const tokens: Tok[] = [];
  const re = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[3] != null) {
      const text = decodeEntities(m[3]);
      if (text) tokens.push({ kind: "text", text });
      continue;
    }
    const tag = m[1].toLowerCase();
    const attrs = m[2] ?? "";
    const isClose = m[0].startsWith("</");
    const selfClosing =
      /\/\s*>$/.test(m[0]) ||
      ["br", "hr", "img", "meta", "link", "input"].includes(tag);
    if (isClose) tokens.push({ kind: "close", tag });
    else if (selfClosing) tokens.push({ kind: "void", tag, attrs });
    else tokens.push({ kind: "open", tag, attrs });
  }
  return tokens;
}

function attrValue(attrs: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = attrs.match(re);
  return m ? decodeEntities(m[1]) : null;
}

/**
 * Zero-dep HTML → markdown article extract (see design Theme C).
 */
export function htmlToMarkdownArticle(
  html: string,
  baseUrl: string,
): { title: string; markdown: string; bodyChars: number } {
  const stripped = stripBlocks(html);
  const title = extractTitle(stripped, baseUrl);
  let root = selectBodyRoot(stripped);
  root = removeNoiseTags(root);

  const tokens = tokenize(root);
  const lines: string[] = [];
  let para: string[] = [];
  let listDepth = 0;
  let inPre = false;
  let preBuf: string[] = [];
  let linkHref: string | null = null;
  let linkText: string[] = [];
  let headingLevel = 0;
  let headingBuf: string[] = [];
  let bold = 0;
  let italic = 0;

  const flushPara = () => {
    const t = para.join("").replace(/\s+/g, " ").trim();
    para = [];
    if (!t) return;
    if (headingLevel > 0) {
      lines.push(`${"#".repeat(headingLevel)} ${t}`);
      lines.push("");
      headingLevel = 0;
      return;
    }
    if (listDepth > 0) {
      const indent = "  ".repeat(Math.max(0, listDepth - 1));
      lines.push(`${indent}- ${t}`);
      return;
    }
    lines.push(t);
    lines.push("");
  };

  const pushText = (raw: string) => {
    let t = raw;
    if (!inPre) t = t.replace(/\s+/g, " ");
    if (linkHref != null) {
      linkText.push(t);
      return;
    }
    if (headingLevel > 0) {
      headingBuf.push(t);
      para.push(t);
      return;
    }
    if (inPre) {
      preBuf.push(raw);
      return;
    }
    if (bold > 0) t = `**${t}**`;
    else if (italic > 0) t = `*${t}*`;
    para.push(t);
  };

  for (const tok of tokens) {
    if (tok.kind === "text") {
      pushText(tok.text);
      continue;
    }

    const tag = tok.tag;

    if (tok.kind === "void") {
      if (tag === "br") {
        para.push("\n");
      } else if (tag === "hr") {
        flushPara();
        lines.push("---");
        lines.push("");
      } else if (tag === "img") {
        const alt = attrValue(tok.attrs, "alt")?.trim();
        if (alt) pushText(`(${alt})`);
      }
      continue;
    }

    if (tok.kind === "open") {
      if (/^h[1-6]$/.test(tag)) {
        flushPara();
        headingLevel = Number(tag[1]);
        headingBuf = [];
      } else if (tag === "p") {
        flushPara();
      } else if (tag === "li") {
        flushPara();
      } else if (tag === "ul" || tag === "ol") {
        flushPara();
        listDepth += 1;
      } else if (tag === "blockquote") {
        flushPara();
      } else if (tag === "pre") {
        flushPara();
        inPre = true;
        preBuf = [];
      } else if (tag === "code" && !inPre) {
        para.push("`");
      } else if (tag === "a") {
        linkHref = attrValue(tok.attrs, "href");
        linkText = [];
      } else if (tag === "strong" || tag === "b") {
        bold += 1;
      } else if (tag === "em" || tag === "i") {
        italic += 1;
      }
      continue;
    }

    // close
    if (/^h[1-6]$/.test(tag)) {
      flushPara();
      headingLevel = 0;
      headingBuf = [];
    } else if (tag === "p") {
      flushPara();
    } else if (tag === "li") {
      flushPara();
    } else if (tag === "ul" || tag === "ol") {
      flushPara();
      listDepth = Math.max(0, listDepth - 1);
      lines.push("");
    } else if (tag === "blockquote") {
      flushPara();
    } else if (tag === "pre") {
      inPre = false;
      const code = preBuf.join("").replace(/^\n+|\n+$/g, "");
      preBuf = [];
      lines.push("```");
      lines.push(code);
      lines.push("```");
      lines.push("");
    } else if (tag === "code" && !inPre) {
      para.push("`");
    } else if (tag === "a") {
      const text = linkText.join("").replace(/\s+/g, " ").trim() || linkHref || "";
      const href = linkHref ? absUrl(linkHref, baseUrl) : "";
      linkHref = null;
      linkText = [];
      if (href && text) para.push(`[${text}](${href})`);
      else if (text) para.push(text);
    } else if (tag === "strong" || tag === "b") {
      bold = Math.max(0, bold - 1);
    } else if (tag === "em" || tag === "i") {
      italic = Math.max(0, italic - 1);
    }
  }
  flushPara();

  let markdown = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  const bodyChars = markdown.replace(/[#*_`\[\]()>-]/g, "").replace(/\s+/g, "").length;

  // Ensure title heading at top if body doesn't start with h1
  if (title && !markdown.startsWith("# ")) {
    markdown = `# ${title}\n\n${markdown}`.trim();
  }

  return { title, markdown, bodyChars };
}

function yamlEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildClipMarkdownFile(opts: {
  title: string;
  sourceUrl: string;
  acquiredAt: string;
  body: string;
}): string {
  return [
    "---",
    `title: "${yamlEscape(opts.title)}"`,
    `source_url: "${yamlEscape(opts.sourceUrl)}"`,
    `acquired_at: "${yamlEscape(opts.acquiredAt)}"`,
    "---",
    "",
    opts.body.trim(),
    "",
  ].join("\n");
}

export async function acquireWebClip(
  urlRaw: string,
  onProgress?: ProgressCb,
  opts?: { jobId?: number },
): Promise<ClipAcquireResult> {
  const checkCancel = () => {
    if (opts?.jobId != null && isCancelRequested(opts.jobId)) {
      throw new Error("Cancelled");
    }
  };

  const url = assertSafeOutboundUrl(urlRaw.trim(), { httpsOnly: false });

  onProgress?.({
    stage: "fetching",
    percent: 10,
    detail: "Fetching page…",
  });
  checkCancel();

  const fetched = await fetchSafeOutbound(url.href, {
    httpsOnly: false,
    timeoutMs: CLIP_TIMEOUT_MS,
    maxBytes: CLIP_MAX_BYTES,
    headers: {
      "User-Agent":
        "HelixLibrary/0.1 (personal OPAC; localhost; article clip)",
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
    },
  });

  checkCancel();
  const ctype = (fetched.res.headers.get("content-type") || "").toLowerCase();
  if (
    ctype &&
    !ctype.includes("text/html") &&
    !ctype.includes("application/xhtml") &&
    !ctype.includes("text/plain")
  ) {
    // Soft reject obvious binaries
    if (
      ctype.includes("application/pdf") ||
      ctype.includes("image/") ||
      ctype.includes("video/") ||
      ctype.includes("audio/")
    ) {
      throw new Error(`URL is not an HTML page (${ctype})`);
    }
  }

  // Reject PDF magic
  if (fetched.buf.subarray(0, 5).toString("utf8") === "%PDF-") {
    throw new Error("URL returned a PDF; use Papers or arXiv to shelve PDFs");
  }

  onProgress?.({
    stage: "extracting",
    percent: 45,
    detail: "Extracting article text…",
  });

  const html = fetched.buf.toString("utf8");
  const { title, markdown, bodyChars } = htmlToMarkdownArticle(
    html,
    fetched.finalUrl,
  );
  if (bodyChars < MIN_BODY_CHARS) {
    throw new Error(
      "Could not extract article text (page may be JS-only or blocked).",
    );
  }

  const acquiredAt = new Date().toISOString();
  const fileBody = buildClipMarkdownFile({
    title,
    sourceUrl: fetched.finalUrl,
    acquiredAt,
    body: markdown,
  });

  const stamp = acquiredAt.replace(/[:.]/g, "-").slice(0, 19);
  const slug = slugify(title) || "page";
  const filename = `clip-${stamp}-${slug}.md`;
  const dest = safeArchivePath("notes", filename);

  onProgress?.({
    stage: "writing",
    percent: 80,
    detail: "Writing note…",
  });
  await writeFile(dest, fileBody, "utf8");

  onProgress?.({
    stage: "reindexing",
    percent: 92,
    detail: "Indexing & applying tags…",
  });
  checkCancel();

  const indexed = await indexAfterAcquire(dest, { source: "clip" });
  if (indexed.itemId != null) {
    try {
      setItemCatalogTitle(indexed.itemId, title, "clip");
    } catch {
      /* non-fatal */
    }
    try {
      const host = new URL(fetched.finalUrl).hostname;
      const ht = valueToTagName(host.replace(/^www\./, ""));
      if (ht) addTagToItem(indexed.itemId, ht, "acquire");
    } catch {
      /* ignore */
    }
  }

  return {
    path: dest,
    relPath: `notes/${filename}`,
    title,
    sourceUrl: fetched.finalUrl,
    bytes: Buffer.byteLength(fileBody, "utf8"),
    itemId: indexed.itemId,
    tags: indexed.tags,
  };
}
