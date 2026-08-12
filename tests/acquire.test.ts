import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import path from "node:path";
import { buildArxivSearchQuery, parseArxivId } from "@/lib/acquire/arxiv";
import {
  tagsFromExifAndSource,
  valueToTagName,
} from "@/lib/acquire/auto-tags";
import {
  buildClipMarkdownFile,
  htmlToMarkdownArticle,
  isAllowedClipUrl,
} from "@/lib/acquire/clip";
import { extractImageBytesFromResponse } from "@/lib/acquire/grok-image";
import {
  assertSafeOutboundUrl,
  sniffImageExt,
} from "@/lib/acquire/outbound";
import {
  normalizeOpenAlexInput,
  parseDoi,
  parseOpenAlexWorkId,
  reconstructAbstract,
  resolveOaPdfUrl,
} from "@/lib/acquire/openalex";
import {
  assertUnderArchive,
  getArchiveRoot,
  getDefaultArchiveRoot,
  listAcquireTargets,
  resolveArchiveRootFromLocationId,
  runWithArchiveRoot,
  sanitizeFilename,
  safeArchivePath,
} from "@/lib/acquire/paths";
import { syncLocationsFromConfig } from "@/lib/locations/sync";
import {
  normalizeYoutubeUrl,
  parseYtDlpProgressLine,
} from "@/lib/acquire/youtube";
import { createJob, getJob } from "@/lib/jobs/store";
import { ACQUIRE_JOB_KINDS } from "@/lib/jobs/types";
import { ACQUIRE_TAG_NAMES } from "@/lib/tags/backfill-source";
import {
  parseGrokipediaSlug,
  parseGrokipediaSearchHtml,
  titleFromSlug,
  grokipediaPageUrl,
  extractGrokipediaRedirect,
  mediaWikiPrimarySlug,
  looksNonEnglishBody,
  looksLikeExactGrokipediaSlug,
  rankGrokipediaHits,
} from "@/lib/acquire/grokipedia";
import { createTestEnv } from "./helpers/harness";

describe("parseArxivId", () => {
  it("parses bare modern ids", () => {
    assert.equal(parseArxivId("1706.03762"), "1706.03762");
    assert.equal(parseArxivId("1706.03762v2"), "1706.03762");
  });

  it("parses URLs and arxiv: prefix", () => {
    assert.equal(
      parseArxivId("https://arxiv.org/abs/1706.03762"),
      "1706.03762",
    );
    assert.equal(
      parseArxivId("https://arxiv.org/pdf/1706.03762.pdf"),
      "1706.03762",
    );
    assert.equal(parseArxivId("arxiv:2301.00001"), "2301.00001");
  });

  it("rejects garbage", () => {
    assert.equal(parseArxivId(""), null);
    assert.equal(parseArxivId("not-a-paper"), null);
  });
});

describe("buildArxivSearchQuery", () => {
  it("maps keywords to all: AND query", () => {
    assert.equal(
      buildArxivSearchQuery("attention transformers"),
      "all:attention+AND+all:transformers",
    );
  });

  it("maps bare id to id: search", () => {
    assert.equal(buildArxivSearchQuery("1706.03762"), "id:1706.03762");
  });
});

describe("acquire path safety", () => {
  it("rejects escape attempts under archive", () => {
    const env = createTestEnv({
      root: path.join(process.cwd(), "fixtures", "sample-root"),
      locationName: "Archive",
    });
    try {
      const root = getArchiveRoot();
      assert.ok(root);
      assert.equal(getDefaultArchiveRoot(), root);
      assert.throws(() => safeArchivePath("documents", "../etc/passwd"));
      assert.throws(() => assertUnderArchive("/tmp/evil.pdf"));
      const ok = safeArchivePath("documents", "ok-paper.pdf");
      assert.ok(ok.endsWith(`${path.sep}documents${path.sep}ok-paper.pdf`));
    } finally {
      env.cleanup();
    }
  });

  it("runWithArchiveRoot overrides destination", () => {
    const env = createTestEnv({
      root: path.join(process.cwd(), "fixtures", "sample-root"),
      locationName: "Archive",
    });
    try {
      const other = env.dir;
      const dest = runWithArchiveRoot(other, () =>
        safeArchivePath("notes", "clip.md"),
      );
      assert.ok(dest.startsWith(other));
      assert.ok(dest.endsWith(`${path.sep}notes${path.sep}clip.md`));
      // Outside the ALS override, default root returns
      assert.ok(!getArchiveRoot().startsWith(path.join(other, "notes")));
    } finally {
      env.cleanup();
    }
  });

  it("lists targets and resolves location ids", () => {
    const env = createTestEnv({
      root: path.join(process.cwd(), "fixtures", "sample-root"),
      locationName: "Archive",
    });
    try {
      syncLocationsFromConfig();
      const targets = listAcquireTargets();
      assert.ok(targets.length >= 1);
      const arch = targets.find((t) => t.name === "Archive");
      assert.ok(arch);
      assert.equal(arch!.writable, true);
      const root = resolveArchiveRootFromLocationId(arch!.locationId);
      assert.equal(root, arch!.root);
      assert.throws(() => resolveArchiveRootFromLocationId(999999));
    } finally {
      env.cleanup();
    }
  });

  it("sanitizeFilename keeps basename only", () => {
    assert.equal(sanitizeFilename("../../x.pdf"), "x.pdf");
    assert.equal(sanitizeFilename("a b c.pdf"), "a_b_c.pdf");
  });
});

describe("youtube helpers", () => {
  it("normalizes youtu.be share links", () => {
    assert.equal(
      normalizeYoutubeUrl(
        "https://youtu.be/O2K0ptoYpuc?si=axlAb4ZWxTqKrpBU",
      ),
      "https://www.youtube.com/watch?v=O2K0ptoYpuc",
    );
  });

  it("parses yt-dlp progress percent", () => {
    const p = parseYtDlpProgressLine(
      "[download]  45.2% of   12.00MiB at  1.00MiB/s ETA 00:06",
    );
    assert.ok(p);
    assert.equal(p!.stage, "downloading");
    assert.ok(p!.percent != null && p!.percent > 30 && p!.percent < 50);
  });

  it("parses HLX progress template and extract stages", () => {
    const hlx = parseYtDlpProgressLine(
      "HLXpct= 12.5% speed=2.00MiB/s eta=00:40 total=100.00MiB",
    );
    assert.ok(hlx);
    assert.equal(hlx!.stage, "downloading");
    assert.ok(hlx!.detail?.includes("12.5"));
    assert.ok(hlx!.percent != null && hlx!.percent > 5);

    const ex = parseYtDlpProgressLine(
      "[youtube] O2K0ptoYpuc: Downloading webpage",
    );
    assert.ok(ex);
    assert.equal(ex!.stage, "extracting");
  });
});

describe("acquire auto-tags", () => {
  it("valueToTagName normalizes labels", () => {
    assert.equal(valueToTagName("  Zakir Hussain "), "zakir-hussain");
    assert.equal(valueToTagName("eng"), "eng");
  });

  it("tagsFromExifAndSource includes source + artist/genre", () => {
    const tags = tagsFromExifAndSource(
      {
        Artist: "Zakir Hussain",
        Genre: "World",
        MediaLanguageCode: "eng",
        Encoder: "Google",
      },
      "youtube",
    );
    assert.ok(tags.includes("acquired"));
    assert.ok(tags.includes("youtube"));
    assert.ok(tags.includes("zakir-hussain"));
    assert.ok(tags.includes("world"));
    assert.ok(tags.includes("lang-eng"));
  });

  it("tags openalex and clip sources", () => {
    assert.ok(tagsFromExifAndSource(null, "openalex").includes("openalex"));
    assert.ok(tagsFromExifAndSource(null, "clip").includes("clip"));
  });
});

describe("extractImageBytesFromResponse", () => {
  it("prefers b64 over url", () => {
    const r = extractImageBytesFromResponse({
      data: [{ b64_json: "abc", url: "https://example.com/x.png" }],
    });
    assert.equal(r.kind, "b64");
    assert.equal(r.value, "abc");
  });

  it("accepts url-only", () => {
    const r = extractImageBytesFromResponse({
      data: [{ url: "https://cdn.example.com/a.png" }],
    });
    assert.equal(r.kind, "url");
  });

  it("rejects empty", () => {
    assert.throws(() => extractImageBytesFromResponse({ data: [] }));
    assert.throws(() => extractImageBytesFromResponse({ data: [{}] }));
  });
});

describe("assertSafeOutboundUrl", () => {
  it("allows public https", () => {
    const u = assertSafeOutboundUrl("https://export.arxiv.org/pdf/x.pdf");
    assert.equal(u.hostname, "export.arxiv.org");
  });

  it("blocks private and file", () => {
    assert.throws(() => assertSafeOutboundUrl("http://127.0.0.1/x"));
    assert.throws(() => assertSafeOutboundUrl("http://192.168.1.1/x"));
    assert.throws(() => assertSafeOutboundUrl("file:///etc/passwd"));
    assert.throws(() =>
      assertSafeOutboundUrl("http://example.com/x", { httpsOnly: true }),
    );
  });

  it("allows http when httpsOnly false", () => {
    const u = assertSafeOutboundUrl("http://example.com/post", {
      httpsOnly: false,
    });
    assert.equal(u.protocol, "http:");
  });
});

describe("sniffImageExt", () => {
  it("detects png magic", () => {
    const buf = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0,
    ]);
    assert.equal(sniffImageExt(buf), "png");
  });
});

describe("OpenAlex parse helpers", () => {
  it("parses DOI forms", () => {
    assert.equal(parseDoi("10.1038/nature14539"), "10.1038/nature14539");
    assert.equal(
      parseDoi("https://doi.org/10.1038/nature14539"),
      "10.1038/nature14539",
    );
    assert.equal(parseDoi("doi:10.1000/xyz"), "10.1000/xyz");
    assert.equal(parseDoi("not-a-doi"), null);
  });

  it("parses OpenAlex work ids", () => {
    assert.equal(parseOpenAlexWorkId("W2741809807"), "W2741809807");
    assert.equal(
      parseOpenAlexWorkId("https://openalex.org/works/W2741809807"),
      "W2741809807",
    );
  });

  it("normalizes input kinds", () => {
    assert.equal(normalizeOpenAlexInput("W1").type, "work");
    assert.equal(normalizeOpenAlexInput("10.1038/nature14539").type, "doi");
    assert.equal(normalizeOpenAlexInput("transformers").type, "search");
  });

  it("resolves OA pdf urls https only", () => {
    assert.equal(
      resolveOaPdfUrl({
        best_oa_location: { pdf_url: "https://cdn.example.com/a.pdf" },
      }),
      "https://cdn.example.com/a.pdf",
    );
    assert.equal(
      resolveOaPdfUrl({
        best_oa_location: { pdf_url: "http://cdn.example.com/a.pdf" },
        primary_location: { pdf_url: "https://ok.example.com/b.pdf" },
      }),
      "https://ok.example.com/b.pdf",
    );
    assert.equal(
      resolveOaPdfUrl({
        best_oa_location: { landing_page_url: "https://example.com/abs" },
      }),
      null,
    );
  });

  it("reconstructs abstract inverted index", () => {
    const text = reconstructAbstract({
      Hello: [0],
      world: [1],
      from: [2],
      OpenAlex: [3],
    });
    assert.equal(text, "Hello world from OpenAlex");
  });
});

describe("web clip extract", () => {
  const fixture = (name: string) =>
    readFileSync(
      path.join(process.cwd(), "tests", "fixtures", "clip", name),
      "utf8",
    );

  it("simple-article uses og:title and keeps key phrase", () => {
    const { title, markdown, bodyChars } = htmlToMarkdownArticle(
      fixture("simple-article.html"),
      "https://example.com/stars",
    );
    assert.equal(title, "Simple Article About Stars");
    assert.ok(bodyChars >= 200);
    assert.match(markdown, /phosphor catalog entry/);
    assert.doesNotMatch(markdown, /unique-nav-xyz/);
    assert.doesNotMatch(markdown, /unique-footer-xyz/);
  });

  it("blog-with-nav drops nav/aside/footer markers", () => {
    const { markdown, bodyChars } = htmlToMarkdownArticle(
      fixture("blog-with-nav.html"),
      "https://blog.example.com/memory",
    );
    assert.ok(bodyChars >= 80);
    assert.match(markdown, /exclusive-article-body/);
    assert.doesNotMatch(markdown, /exclusive-nav-marker/);
    assert.doesNotMatch(markdown, /exclusive-aside-marker/);
    assert.doesNotMatch(markdown, /exclusive-footer-marker/);
  });

  it("entities decode in title and body", () => {
    const { title, markdown } = htmlToMarkdownArticle(
      fixture("entities.html"),
      "https://example.com/e",
    );
    assert.match(title, /Ampersands & Quotes/);
    assert.match(markdown, /Tom & Jerry/);
    assert.match(markdown, /"hello"/);
  });

  it("too-thin fails quality gate", () => {
    const { bodyChars } = htmlToMarkdownArticle(
      fixture("too-thin.html"),
      "https://example.com/thin",
    );
    assert.ok(bodyChars < 80);
  });

  it("isAllowedClipUrl blocks private hosts", () => {
    assert.equal(isAllowedClipUrl("https://example.com/a"), true);
    assert.equal(isAllowedClipUrl("http://127.0.0.1/x"), false);
  });

  it("buildClipMarkdownFile has frontmatter", () => {
    const md = buildClipMarkdownFile({
      title: 'Hi "there"',
      sourceUrl: "https://example.com/a",
      acquiredAt: "2026-08-07T00:00:00.000Z",
      body: "# Hi\n\nBody",
    });
    assert.match(md, /^---\n/);
    assert.match(md, /source_url: "https:\/\/example.com\/a"/);
  });
});

describe("job kinds openalex/clip", () => {
  it("ACQUIRE_JOB_KINDS includes new kinds", () => {
    assert.ok(ACQUIRE_JOB_KINDS.includes("openalex"));
    assert.ok(ACQUIRE_JOB_KINDS.includes("clip"));
  });

  it("ACQUIRE_TAG_NAMES includes openalex and clip", () => {
    assert.ok((ACQUIRE_TAG_NAMES as readonly string[]).includes("openalex"));
    assert.ok((ACQUIRE_TAG_NAMES as readonly string[]).includes("clip"));
  });

  it("toHelixJob round-trips openalex and clip kinds", () => {
    const env = createTestEnv();
    try {
      const a = createJob({ kind: "openalex", label: "W1" });
      const b = createJob({ kind: "clip", label: "https://example.com" });
      assert.equal(getJob(a.id)?.kind, "openalex");
      assert.equal(getJob(b.id)?.kind, "clip");
    } finally {
      env.cleanup();
    }
  });
});


describe("Grokipedia helpers", () => {
  it("parses slug and URL forms", () => {
    assert.equal(parseGrokipediaSlug("Artificial intelligence"), "Artificial_intelligence");
    assert.equal(
      parseGrokipediaSlug("https://grokipedia.com/page/Artificial_intelligence"),
      "Artificial_intelligence",
    );
    assert.equal(parseGrokipediaSlug("Helix"), "Helix");
    assert.equal(parseGrokipediaSlug(""), null);
  });

  it("builds page URLs and titles", () => {
    assert.match(grokipediaPageUrl("Artificial_intelligence"), /\/page\/Artificial_intelligence$/);
    assert.equal(titleFromSlug("Artificial_intelligence"), "Artificial intelligence");
  });

  it("parses search HTML for /page/ links", () => {
    const html = `
      <a href="/page/Helix">Helix</a>
      <a href="/page/Project_Helix">Project</a>
      <a href="/page/Helix">dup</a>
    `;
    const hits = parseGrokipediaSearchHtml(html);
    assert.equal(hits.length, 2);
    assert.equal(hits[0]!.slug, "Helix");
    assert.equal(hits[1]!.slug, "Project_Helix");
  });

  it("extracts wiki REDIRECT to English slug", () => {
    const html = `#REDIRECT [Artificial intelligence](https://grokipedia.com/page/Artificial_intelligence)`;
    assert.equal(
      extractGrokipediaRedirect(html),
      "Artificial_intelligence",
    );
    // Grokipedia HTML embeds the link as an <a href>
    const htmlAnchor =
      '#REDIRECT [<a href="/page/Artificial_intelligence">Artificial intelligence</a>]';
    assert.equal(
      extractGrokipediaRedirect(htmlAnchor),
      "Artificial_intelligence",
    );
    assert.equal(
      mediaWikiPrimarySlug("Artificial_Intelligence"),
      "Artificial_intelligence",
    );
    // Case-only slug differences are distinct URLs on Grokipedia
    assert.notEqual("Artificial_Intelligence", "Artificial_intelligence");
  });


  it("does not treat bare titles as exact slugs", () => {
    assert.equal(looksLikeExactGrokipediaSlug("Palantir"), false);
    assert.equal(looksLikeExactGrokipediaSlug("Artificial intelligence"), false);
    assert.equal(looksLikeExactGrokipediaSlug("Artificial_Intelligence"), true);
    assert.equal(
      looksLikeExactGrokipediaSlug("https://grokipedia.com/page/Palantir_Technologies"),
      true,
    );
  });

  it("ranks Palantir_Technologies above Mafia", () => {
    const ranked = rankGrokipediaHits(
      [
        { slug: "Palantir_Mafia", title: "Palantir Mafia", url: "u1" },
        { slug: "Palantir_Technologies", title: "Palantir Technologies", url: "u2" },
        { slug: "Tar-Palantir", title: "Tar-Palantir", url: "u3" },
      ],
      "Palantir",
    );
    assert.equal(ranked[0]!.slug, "Palantir_Technologies");
  });

  it("detects French body vs English", () => {
    assert.equal(
      looksNonEnglishBody(
        "Les origines conceptuelles de l'intelligence artificielle remontent à des réflexions. L'histoire des automates est dans les textes pour les chercheurs avec une base.",
      ),
      true,
    );
    assert.equal(
      looksNonEnglishBody(
        "Artificial intelligence is the science and engineering of making intelligent machines for that purpose with history from the early years.",
      ),
      false,
    );
  });
});

describe("job kinds grokipedia/image_url", () => {
  it("includes new kinds in ACQUIRE_JOB_KINDS", () => {
    assert.ok(ACQUIRE_JOB_KINDS.includes("grokipedia"));
    assert.ok(ACQUIRE_JOB_KINDS.includes("image_url"));
  });

  it("round-trips new job kinds", () => {
    const env = createTestEnv();
    try {
      const a = createJob({ kind: "grokipedia", label: "Helix" });
      const b = createJob({ kind: "image_url", label: "https://x/a.png" });
      assert.equal(getJob(a.id)?.kind, "grokipedia");
      assert.equal(getJob(b.id)?.kind, "image_url");
    } finally {
      env.cleanup();
    }
  });
});
