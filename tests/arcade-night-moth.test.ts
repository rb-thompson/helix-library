import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ABILITIES,
  applyCombo,
  bearingDeg,
  compassLabel,
  composeNight,
  homeRegionForLamp,
  isLure,
  isTrueLamp,
  lampSipScore,
  lureKillScore,
  nextAbility,
  nextUnlock,
  nightClearScore,
  regionAt,
  scatterRegionId,
  sipOutcome,
  tutorialLamps,
  unlockedAbilities,
} from "@/lib/arcade/night-moth";
import {
  mergeBoards,
  parseBoard,
  sanitizeInitials,
} from "@/lib/client/arcade-board";
import { getSqlite } from "@/lib/db/client";
import {
  getProgress,
  listScores,
  saveProgress,
  submitScore,
} from "@/lib/arcade/scores";
import { createTestEnv } from "./helpers/harness";

function seq(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[i % values.length] ?? 0;
    i += 1;
    return v;
  };
}

describe("night moth rules", () => {
  it("treats circulation as true and the cage as a lure", () => {
    assert.equal(isTrueLamp("circulation"), true);
    assert.equal(isLure("zapper"), true);
    assert.equal(isLure("nectar-trap"), true);
    assert.equal(isTrueLamp("helix"), true);
  });

  it("scores true sips with night and combo, never lures", () => {
    assert.equal(lampSipScore("circulation", 1, 1), 100);
    assert.equal(lampSipScore("circulation", 2, 1), 200);
    assert.ok(lampSipScore("archive", 1, 3) > lampSipScore("archive", 1, 1));
    assert.equal(lampSipScore("zapper", 4, 8), 0);
    assert.ok(lureKillScore("wisp", 2, 1) > lureKillScore("zapper", 2, 1));
    assert.equal(nightClearScore(3), 1500);
  });

  it("unlocks abilities on persistent XP thresholds", () => {
    assert.deepEqual(unlockedAbilities(0), ["scale-dust"]);
    assert.ok(unlockedAbilities(150).includes("pheromone-read"));
    assert.ok(!unlockedAbilities(149).includes("pheromone-read"));
    const next = nextUnlock(0);
    assert.equal(next?.id, "wing-cleave");
    assert.equal(next?.remaining, ABILITIES["wing-cleave"].xp);
    assert.equal(nextUnlock(10_000), null);
  });

  it("breaks combo on hurt or a false sip", () => {
    assert.equal(applyCombo(4, "true-sip"), 5);
    assert.equal(applyCombo(4, "hurt"), 0);
    assert.equal(applyCombo(4, "miss-sip"), 0);
  });

  it("returns clean nectar from Circulation and a daze from the cage", () => {
    const good = sipOutcome("circulation", 1, 1);
    assert.ok(good.hp > 0);
    assert.ok(good.nectar > 0);
    assert.ok(good.comboKeep);
    assert.ok(good.conditions.some((c) => c.id === "nectar-glow"));

    const bad = sipOutcome("zapper", 1, 4);
    assert.ok(bad.hp < 0);
    assert.equal(bad.comboKeep, false);
    assert.ok(bad.conditions.some((c) => c.id === "dazed"));
  });

  it("always plants a Circulation lamp and grows lures with the night", () => {
    const first = composeNight(1, seq([0.1, 0.2, 0.3, 0.4]));
    assert.ok(first.lamps.includes("circulation"));
    assert.ok(first.lamps.length >= 6);
    assert.ok(first.sparks >= 2);

    const late = composeNight(7, seq([0.9, 0.8, 0.1, 0.5, 0.2, 0.7]));
    assert.ok(late.lamps.includes("circulation"));
    assert.ok(late.lamps.some(isLure));
    assert.ok(late.lamps.length > first.lamps.length);
    assert.ok(tutorialLamps().includes("zapper"));
  });

  it("names regions and bears north toward the moon plaza", () => {
    assert.equal(regionAt(0, 0).id, "court");
    assert.equal(regionAt(-92, -78).id, "grove");
    assert.equal(homeRegionForLamp("zapper"), "yard");
    assert.equal(compassLabel(bearingDeg(0, 0, 0, -100)), "N");
    assert.equal(compassLabel(bearingDeg(0, 0, 80, 0)), "E");
  });

  it("scatters lamps across regions instead of always home", () => {
    const ids = new Set<string>();
    const rng = seq([0.9, 0.1, 0.5, 0.2, 0.8, 0.3, 0.7, 0.4]);
    for (let i = 0; i < 16; i++) ids.add(scatterRegionId("zapper", rng));
    assert.ok(ids.size >= 2);
  });

  it("cycles abilities and wraps", () => {
    const list = ["scale-dust", "wing-cleave", "pheromone-read"] as const;
    assert.equal(nextAbility(list, "scale-dust", 1), "wing-cleave");
    assert.equal(nextAbility(list, "pheromone-read", 1), "scale-dust");
    assert.equal(nextAbility(list, "scale-dust", -1), "pheromone-read");
  });
});

describe("arcade persistence", () => {
  let env: ReturnType<typeof createTestEnv>;

  before(() => {
    env = createTestEnv();
  });

  after(() => {
    env.cleanup();
  });

  it("records a scoreboard row and keeps the high score first", () => {
    submitScore({
      game: "night-moth",
      score: 400,
      night: 2,
      nectar: 6,
      durationMs: 40_000,
      abilities: ["scale-dust", "not-real"],
    });
    submitScore({
      game: "night-moth",
      score: 1200,
      night: 4,
      nectar: 18,
      durationMs: 90_000,
      abilities: ["scale-dust", "wing-cleave"],
    });
    const board = listScores("night-moth");
    assert.ok(board.length >= 2);
    assert.equal(board[0]?.score, 1200);
    assert.deepEqual(board[0]?.abilities, ["scale-dust", "wing-cleave"]);
    assert.equal(
      submitScore({
        game: "night-moth",
        score: 50,
        night: 1,
        nectar: 1,
        durationMs: 1000,
        initials: "ab!",
      }).initials,
      "ABX",
    );
    const first = submitScore({
      game: "night-moth",
      score: 333,
      night: 2,
      nectar: 4,
      durationMs: 8000,
      initials: "MTH",
    });
    const again = submitScore({
      game: "night-moth",
      score: 333,
      night: 2,
      nectar: 4,
      durationMs: 8100,
      initials: "MTH",
    });
    assert.equal(again.id, first.id);
    assert.equal(listScores("night-moth").filter((s) => s.score === 333).length, 1);
    assert.ok(!board[1]?.abilities.includes("not-real" as never));
  });

  it("derives unlocks from saved XP", () => {
    const saved = saveProgress({
      game: "night-moth",
      xp: 150,
      tutorialDone: true,
    });
    assert.ok(saved.unlocked.includes("pheromone-read"));
    assert.equal(saved.tutorialDone, true);
    const again = getProgress("night-moth");
    assert.equal(again.xp, 150);
    assert.ok(again.unlocked.includes("scale-dust"));
  });

  it("adds initials on a catalog that already had arcade_scores", () => {
    const sqlite = getSqlite();
    sqlite.exec(`ALTER TABLE arcade_scores DROP COLUMN initials`);
    const row = submitScore({
      game: "night-moth",
      score: 77,
      night: 1,
      nectar: 1,
      durationMs: 2000,
      initials: "HEL",
    });
    assert.equal(row.initials, "HEL");
    const board = listScores("night-moth");
    assert.ok(board.some((s) => s.score === 77 && s.initials === "HEL"));
  });
});

describe("arcade board parse", () => {
  it("reads a local ledger and pads initials", () => {
    const rows = parseBoard(
      JSON.stringify([
        { score: 900, night: 3, nectar: 4, durationMs: 12000, createdAt: 2, initials: "k" },
        { score: 200, night: 1, duration_ms: 3000, createdAt: 1 },
      ]),
    );
    assert.equal(rows[0]?.score, 900);
    assert.equal(rows[0]?.initials, "KXX");
    assert.equal(sanitizeInitials("k9!"), "K9X");
    assert.equal(rows.length, 2);
  });

  it("collapses the same flight when createdAt differs", () => {
    const a = parseBoard(
      JSON.stringify([{ score: 500, night: 2, nectar: 3, durationMs: 12000, createdAt: 1, initials: "MTH" }]),
    );
    const b = parseBoard(
      JSON.stringify([{ score: 500, night: 2, nectar: 3, durationMs: 12100, createdAt: 99, initials: "MTH" }]),
    );
    const merged = mergeBoards(a, b);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.createdAt, 1);
  });
});
