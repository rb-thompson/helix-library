import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { libraryHours, pickCartItem } from "@/lib/client/library-hours";

describe("library hours desk", () => {
  it("calls dawn before 11", () => {
    const h = libraryHours(new Date(2026, 7, 15, 7, 30));
    assert.equal(h.phase, "dawn");
    assert.match(h.line, /reading lamps/i);
    assert.match(h.slipLabel, /cart/i);
  });

  it("calls night after 21", () => {
    const h = libraryHours(new Date(2026, 7, 15, 22, 0));
    assert.equal(h.phase, "night");
  });

  it("picks the same holding for the same hour", () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const a = pickCartItem(items, new Date(2026, 7, 15, 8, 1));
    const b = pickCartItem(items, new Date(2026, 7, 15, 8, 59));
    assert.ok(a);
    assert.equal(a?.id, b?.id);
  });

  it("returns null for an empty cart", () => {
    assert.equal(pickCartItem([], new Date()), null);
  });
});
