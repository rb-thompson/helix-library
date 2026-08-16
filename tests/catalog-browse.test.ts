import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isBrowseBlockedTarget,
  nextBrowseIndex,
} from "@/lib/client/catalog-browse";

describe("nextBrowseIndex", () => {
  it("wraps forward and backward", () => {
    assert.equal(nextBrowseIndex(0, 1, 3), 1);
    assert.equal(nextBrowseIndex(2, 1, 3), 0);
    assert.equal(nextBrowseIndex(0, -1, 3), 2);
  });

  it("is a no-op on an empty page", () => {
    assert.equal(nextBrowseIndex(0, 1, 0), 0);
  });
});

describe("isBrowseBlockedTarget", () => {
  it("ignores non-elements", () => {
    assert.equal(isBrowseBlockedTarget(null), false);
    assert.equal(isBrowseBlockedTarget("j" as unknown as EventTarget), false);
  });
});
