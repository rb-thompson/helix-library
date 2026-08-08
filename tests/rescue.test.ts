import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { getRescueSnapshot } from "@/lib/catalog/rescue";
import { searchCatalog } from "@/lib/catalog/query";
import { getDb } from "@/lib/db/client";
import { items, itemTags, tags } from "@/lib/db/schema";
import { runReindex } from "@/lib/indexer/run";
import { createTestEnv, ensureThumbsParent } from "./helpers/harness";
import { eq } from "drizzle-orm";

describe("untagged filter + rescue snapshot", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(async () => {
    ensureThumbsParent();
    env = createTestEnv();
    await runReindex();
  });

  after(() => {
    env.cleanup();
  });

  it("untaggedOnly returns items with no tags", () => {
    const db = getDb();
    // Tag one item; leave others untagged
    const row = db.select().from(items).where(eq(items.name, "welcome.txt")).get();
    assert.ok(row);
    const tagIns = db
      .insert(tags)
      .values({ name: "rescue-test-tag" })
      .run();
    const tagId = Number(tagIns.lastInsertRowid);
    db.insert(itemTags)
      .values({ tagId, itemId: row!.id, source: "manual" })
      .run();

    const untagged = searchCatalog({ untaggedOnly: true, pageSize: 100 });
    assert.ok(untagged.items.every((i) => i.id !== row!.id));
    assert.ok(untagged.total >= 1);

    const all = searchCatalog({ pageSize: 100 });
    assert.ok(all.total > untagged.total);
  });

  it("getRescueSnapshot reports untagged counts", () => {
    const snap = getRescueSnapshot();
    assert.ok(typeof snap.untaggedCount === "number");
    assert.ok(snap.untaggedCount >= 0);
    assert.equal(typeof snap.hasWork, "boolean");
    if (snap.untaggedCount > 0) {
      assert.ok(snap.hasWork);
    }
  });

  it("dismissed failed jobs drop out of rescue snapshot", () => {
    const {
      createJob,
      failJob,
      dismissJob,
      listJobs,
    } = require("@/lib/jobs/store") as typeof import("@/lib/jobs/store");

    const job = createJob({ kind: "clip", label: "rescue-dismiss-test" });
    failJob(job.id, "intentional fail for rescue test");

    let snap = getRescueSnapshot();
    assert.ok(
      snap.failedJobs.some((j) => j.id === job.id),
      "failed job should appear on rescue desk",
    );

    dismissJob(job.id);
    snap = getRescueSnapshot();
    assert.ok(
      !snap.failedJobs.some((j) => j.id === job.id),
      "dismissed job must leave rescue desk",
    );

    // Still listed in jobs history
    const listed = listJobs({ limit: 30 });
    const row = listed.find((j) => j.id === job.id);
    assert.ok(row);
    assert.equal(row!.dismissed, true);
  });
});
