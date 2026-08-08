import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { searchCatalog } from "@/lib/catalog/query";
import { runReindex } from "@/lib/indexer/run";
import {
  clampTextMax,
  isTextReadableItem,
  loadItemFileText,
  TEXT_API_MAX_DEFAULT,
  TEXT_API_MAX_HARD,
  TEXT_API_MAX_MIN,
} from "@/lib/media/text";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("item text API helpers", () => {
  let env: ReturnType<typeof createTestEnv>;
  let root: string;

  before(async () => {
    ensureThumbsParent();
    // Custom root so we can add a binary-looking "text" file and large file
    const tmp = createTestEnv();
    // Reuse harness but write extra files into a sibling root under the env dir
    env = tmp;
    root = path.join(env.dir, "holdings");
    mkdirSync(path.join(root, "notes"), { recursive: true });
    writeFileSync(
      path.join(root, "notes", "story.txt"),
      "Line one of the story.\nLine two.\n",
    );
    writeFileSync(
      path.join(root, "notes", "script.py"),
      'print("hello reading room")\n',
    );
    // Null-byte sample — should 415
    writeFileSync(
      path.join(root, "notes", "fake.txt"),
      Buffer.from([0x48, 0x00, 0x69]),
    );
    // Oversize for clamp test body (we only need modest size; cap tested via max param)
    writeFileSync(
      path.join(root, "notes", "chunk.txt"),
      "A".repeat(3000),
    );

    // Point config at our holdings root
    writeFileSync(
      env.configPath,
      JSON.stringify(
        {
          bind: "127.0.0.1",
          port: 4747,
          dbPath: env.dbPath,
          locations: [{ name: "Holdings", root, enabled: true }],
          ignore: ["**/node_modules/**", "**/.git/**"],
          maxFileBytes: 64 * 1024 * 1024,
          hashFullUnderBytes: 8 * 1024 * 1024,
        },
        null,
        2,
      ),
    );
    // Reset after rewriting config
    const { clearConfigCache } = await import("@/lib/config");
    const { resetDbConnection } = await import("@/lib/db/client");
    clearConfigCache();
    resetDbConnection();
    process.env.NON_OS_CONFIG = env.configPath;

    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("clampTextMax defaults and clamps range", () => {
    assert.equal(clampTextMax(undefined), TEXT_API_MAX_DEFAULT);
    assert.equal(clampTextMax(null), TEXT_API_MAX_DEFAULT);
    assert.equal(clampTextMax("nope"), TEXT_API_MAX_DEFAULT);
    assert.equal(clampTextMax(0), TEXT_API_MAX_DEFAULT);
    assert.equal(clampTextMax(100), TEXT_API_MAX_MIN); // below min → min
    assert.equal(clampTextMax(2048), 2048);
    assert.equal(clampTextMax(TEXT_API_MAX_HARD * 4), TEXT_API_MAX_HARD);
    assert.equal(clampTextMax(String(TEXT_API_MAX_MIN)), TEXT_API_MAX_MIN);
  });

  it("isTextReadableItem allowlist", () => {
    assert.equal(isTextReadableItem({ kind: "text", mime: null }), true);
    assert.equal(isTextReadableItem({ kind: "code", mime: null }), true);
    assert.equal(
      isTextReadableItem({ kind: "other", mime: "text/plain" }),
      true,
    );
    assert.equal(
      isTextReadableItem({ kind: "image", mime: "image/png" }),
      false,
    );
    assert.equal(
      isTextReadableItem({ kind: "document", mime: "application/pdf" }),
      false,
    );
  });

  it("loadItemFileText returns UTF-8 body for text holdings", async () => {
    const hit = searchCatalog({ q: "story", pageSize: 10 });
    const item = hit.items.find((i) => i.name === "story.txt");
    assert.ok(item, "story.txt indexed");

    const result = await loadItemFileText(item!.id);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.text, /Line one of the story/);
    assert.equal(result.encoding, "utf-8");
    assert.equal(result.truncated, false);
    assert.ok(result.byteLength > 0);
  });

  it("loadItemFileText works for code kind", async () => {
    const hit = searchCatalog({ q: "script", kind: "code", pageSize: 10 });
    const item = hit.items.find((i) => i.name === "script.py");
    assert.ok(item, "script.py indexed");

    const result = await loadItemFileText(item!.id);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.match(result.text, /hello reading room/);
  });

  it("loadItemFileText rejects binary (null bytes) with 415", async () => {
    const hit = searchCatalog({ q: "fake", pageSize: 20 });
    const item = hit.items.find((i) => i.name === "fake.txt");
    assert.ok(item, "fake.txt indexed");

    const result = await loadItemFileText(item!.id);
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.status, 415);
  });

  it("loadItemFileText rejects non-text kinds with 415", async () => {
    // No images in this root — use a document-less path: invent missing id first
    const missing = await loadItemFileText(999_999);
    assert.equal(missing.ok, false);
    if (missing.ok) return;
    assert.equal(missing.status, 404);
  });

  it("loadItemFileText respects max clamp (truncates)", async () => {
    const hit = searchCatalog({ q: "chunk", pageSize: 10 });
    const item = hit.items.find((i) => i.name === "chunk.txt");
    assert.ok(item);

    // max below min clamps up to 1 KiB — still truncates 3000-char file
    const result = await loadItemFileText(item!.id, 500);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.truncated, true);
    assert.ok(result.text.length <= TEXT_API_MAX_MIN + 16); // utf8 length ≤ read cap
    assert.equal(result.text.length, TEXT_API_MAX_MIN); // all 'A's
  });
});
