import assert from "node:assert/strict";
import { describe, it } from "node:test";
import path from "node:path";
import { buildArxivSearchQuery, parseArxivId } from "@/lib/acquire/arxiv";
import {
  tagsFromExifAndSource,
  valueToTagName,
} from "@/lib/acquire/auto-tags";
import {
  normalizeYoutubeUrl,
  parseYtDlpProgressLine,
} from "@/lib/acquire/youtube";
import {
  assertUnderArchive,
  getArchiveRoot,
  sanitizeFilename,
  safeArchivePath,
} from "@/lib/acquire/paths";
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
      assert.throws(() => safeArchivePath("documents", "../etc/passwd"));
      assert.throws(() => assertUnderArchive("/tmp/evil.pdf"));
      const ok = safeArchivePath("documents", "ok-paper.pdf");
      assert.ok(ok.endsWith(`${path.sep}documents${path.sep}ok-paper.pdf`));
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
});
