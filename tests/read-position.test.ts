import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getReadPositionFromList,
  parseReadPositions,
  READ_POSITION_CAP,
  serializeReadPositions,
  upsertReadPosition,
  type ReadPosition,
} from "@/lib/client/read-position";

describe("read-position pure helpers", () => {
  it("parseReadPositions returns [] for null/invalid", () => {
    assert.deepEqual(parseReadPositions(null), []);
    assert.deepEqual(parseReadPositions(""), []);
    assert.deepEqual(parseReadPositions("not-json"), []);
    assert.deepEqual(parseReadPositions("{}"), []);
    assert.deepEqual(parseReadPositions("[1,2]"), []);
  });

  it("parseReadPositions keeps valid entries and drops junk", () => {
    const raw = JSON.stringify([
      { itemId: 1, scrollRatio: 0.5, updatedAt: 100 },
      { itemId: "x", scrollRatio: 0.2, updatedAt: 90 },
      { itemId: 2, page: 3, updatedAt: 80 },
      { itemId: 3, scrollRatio: 1.5, updatedAt: 70 }, // invalid ratio
      { itemId: 4, page: 0, updatedAt: 60 }, // invalid page
    ]);
    const list = parseReadPositions(raw);
    assert.equal(list.length, 2);
    assert.equal(list[0]!.itemId, 1);
    assert.equal(list[0]!.scrollRatio, 0.5);
    assert.equal(list[1]!.itemId, 2);
    assert.equal(list[1]!.page, 3);
  });

  it("serialize + parse round-trips", () => {
    const entries: ReadPosition[] = [
      { itemId: 9, scrollRatio: 0.25, updatedAt: 1 },
      { itemId: 8, page: 12, updatedAt: 2 },
    ];
    const again = parseReadPositions(serializeReadPositions(entries));
    assert.deepEqual(again, entries);
  });

  it("upsertReadPosition is MRU and caps", () => {
    let list: ReadPosition[] = [];
    for (let i = 1; i <= 5; i++) {
      list = upsertReadPosition(
        list,
        { itemId: i, scrollRatio: i / 10, updatedAt: i },
        3,
      );
    }
    assert.equal(list.length, 3);
    assert.deepEqual(
      list.map((e) => e.itemId),
      [5, 4, 3],
    );

    list = upsertReadPosition(
      list,
      { itemId: 3, scrollRatio: 0.99, updatedAt: 999 },
      3,
    );
    assert.equal(list[0]!.itemId, 3);
    assert.equal(list[0]!.scrollRatio, 0.99);
    assert.equal(list.length, 3);
  });

  it("upsert clamps scrollRatio to 0..1", () => {
    const list = upsertReadPosition([], {
      itemId: 1,
      scrollRatio: 2,
      updatedAt: 1,
    });
    assert.equal(list[0]!.scrollRatio, 1);

    const list2 = upsertReadPosition([], {
      itemId: 1,
      scrollRatio: -0.5,
      updatedAt: 1,
    });
    assert.equal(list2[0]!.scrollRatio, 0);
  });

  it("getReadPositionFromList finds by id", () => {
    const list: ReadPosition[] = [
      { itemId: 10, page: 2, updatedAt: 1 },
      { itemId: 20, scrollRatio: 0.1, updatedAt: 2 },
    ];
    assert.equal(getReadPositionFromList(list, 20)?.scrollRatio, 0.1);
    assert.equal(getReadPositionFromList(list, 99), null);
  });

  it("default CAP is 200", () => {
    assert.equal(READ_POSITION_CAP, 200);
    let list: ReadPosition[] = [];
    for (let i = 1; i <= READ_POSITION_CAP + 10; i++) {
      list = upsertReadPosition(list, {
        itemId: i,
        scrollRatio: 0,
        updatedAt: i,
      });
    }
    assert.equal(list.length, READ_POSITION_CAP);
    assert.equal(list[0]!.itemId, READ_POSITION_CAP + 10);
  });
});
