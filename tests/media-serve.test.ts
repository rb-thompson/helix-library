import assert from "node:assert/strict";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { getDb } from "@/lib/db/client";
import { items, locations } from "@/lib/db/schema";
import { mediaDisposition, resolveMediaItem } from "@/lib/media/serve";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";

describe("media serve jail + disposition", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    ensureThumbsParent();
    env = createTestEnv();
  });

  after(() => {
    env.cleanup();
  });

  it("refuses a symlink that walks out of the location root", () => {
    const root = path.join(env.dir, "stack");
    mkdirSync(root, { recursive: true });
    const outside = path.join(env.dir, "secret.txt");
    writeFileSync(outside, "nope");
    const link = path.join(root, "escape.txt");
    symlinkSync(outside, link);

    const db = getDb();
    const loc = db
      .insert(locations)
      .values({
        name: "Jail",
        rootPath: root,
        enabled: 1,
      })
      .run();
    const locationId = Number(loc.lastInsertRowid);

    const safe = path.join(root, "ok.txt");
    writeFileSync(safe, "hello");
    const okIns = db
      .insert(items)
      .values({
        locationId,
        path: safe,
        relPath: "ok.txt",
        name: "ok.txt",
        ext: "txt",
        kind: "text",
        mime: "text/plain",
        sizeBytes: 5,
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        contentHash: "ok",
        title: "ok",
        titleSource: "filename",
        indexedAt: Date.now(),
        isMissing: 0,
      })
      .run();

    const badIns = db
      .insert(items)
      .values({
        locationId,
        path: link,
        relPath: "escape.txt",
        name: "escape.txt",
        ext: "txt",
        kind: "text",
        mime: "text/plain",
        sizeBytes: 4,
        mtimeMs: Date.now(),
        ctimeMs: Date.now(),
        contentHash: "bad",
        title: "escape",
        titleSource: "filename",
        indexedAt: Date.now(),
        isMissing: 0,
      })
      .run();

    const ok = resolveMediaItem(Number(okIns.lastInsertRowid));
    assert.ok(ok);
    assert.equal(ok!.item.name, "ok.txt");

    const escaped = resolveMediaItem(Number(badIns.lastInsertRowid));
    assert.equal(escaped, null);
  });

  it("forces attachment for HTML and SVG", () => {
    assert.equal(mediaDisposition("text/html", false), "attachment");
    assert.equal(mediaDisposition("image/svg+xml", false), "attachment");
    assert.equal(mediaDisposition("image/jpeg", false), "inline");
    assert.equal(mediaDisposition("image/jpeg", true), "attachment");
  });
});
