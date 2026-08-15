import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { searchCatalog } from "@/lib/catalog/query";
import { gatherLensContext } from "@/lib/lens/context";
import { buildLocalDossier } from "@/lib/lens/local-dossier";
import {
  isVisionKind,
  loadLensVisionFrames,
} from "@/lib/lens/vision";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("Deep Lens vision frames", () => {
  let env: ReturnType<typeof createTestEnv>;
  let pixelId: number;
  let welcomeId: number;

  before(async () => {
    process.env.NON_OS_AGENT_MODE = "local";
    process.env.NON_OS_USE_XAI = "0";
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
    const all = searchCatalog({ pageSize: 50 });
    const pixel = all.items.find((i) => i.name === "pixel.png");
    const welcome = all.items.find((i) => i.name === "welcome.txt");
    assert.ok(pixel, "fixture pixel.png");
    assert.ok(welcome, "fixture welcome.txt");
    pixelId = pixel!.id;
    welcomeId = welcome!.id;
  });

  after(() => {
    env.cleanup();
  });

  it("isVisionKind only image and video", () => {
    assert.equal(isVisionKind("image"), true);
    assert.equal(isVisionKind("video"), true);
    assert.equal(isVisionKind("text"), false);
    assert.equal(isVisionKind("document"), false);
  });

  it("loadLensVisionFrames reads jailed fixture image as still", async () => {
    const loaded = await loadLensVisionFrames(pixelId);
    assert.ok(loaded.frames.length >= 1, "at least one still");
    const frame = loaded.frames[0]!;
    assert.ok(frame.bytes.length > 32);
    assert.match(frame.mediaType, /^image\//);
    // Never leak absolute paths in labels
    assert.ok(!frame.label.includes("/"));
  });

  it("loadLensVisionFrames for text holding has no frames", async () => {
    const loaded = await loadLensVisionFrames(welcomeId);
    assert.equal(loaded.frames.length, 0);
    assert.ok(loaded.caveats.length > 0);
  });

  it("local dossier for image is honest about no vision", () => {
    const ctx = gatherLensContext(pixelId);
    assert.ok(ctx);
    const d = buildLocalDossier(ctx!);
    assert.equal(d.sources.usedVision, false);
    assert.ok(
      d.caveats.some((c) => /vision|picture|stills/i.test(c)),
      "local visual caveat",
    );
    assert.ok(
      !JSON.stringify(d).includes(ctx!.item.path),
      "absolute path must not appear in dossier",
    );
  });
});
