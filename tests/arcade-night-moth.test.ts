import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  ABILITIES,
  applyCombo,
  auroraScoreMul,
  bakeHeightField,
  bearingDeg,
  canEscapeBoss,
  caveAt,
  composeEvents,
  composeFauna,
  composeNight,
  compassLabel,
  districtAt,
  districtLabel,
  featureAt,
  heightAt,
  homeRegionForLamp,
  indexColliders,
  isLure,
  isTrueLamp,
  isWater,
  LAMP_SOCKETS,
  lampSipScore,
  landUseAt,
  lureKillScore,
  miteForNight,
  nextAbility,
  nextUnlock,
  nearbyColliders,
  nightClearScore,
  parseShotBody,
  pickLampSocket,
  regionAt,
  resetHeightField,
  resolveSphere,
  supportY,
  RETREAT,
  scatterRegionId,
  shotFilename,
  sipOutcome,
  slugRegion,
  tutorialLamps,
  unlockedAbilities,
  WATERWAYS,
} from "@/lib/arcade/night-moth";
import {
  mergeBoards,
  parseBoard,
  sanitizeInitials,
} from "@/lib/client/arcade-board";
import {
  BRIGHTNESS_DEFAULT,
  parseArcadePrefs,
  parseArcadePrefsJson,
} from "@/lib/client/arcade-prefs";
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

  it("names The Ward and The Acre as districts over the old regions", () => {
    assert.equal(districtAt(96, -82).id, "ward");
    assert.equal(districtAt(-48, 28).id, "acre");
    assert.equal(districtAt(0, 0).id, "green");
    assert.match(districtLabel(98, 84, "Helix terrace"), /The Ward/);
    assert.equal(districtLabel(0, 0, "Circulation court"), "Circulation court");
  });

  it("paints streets and farm lanes instead of radiating dirt paths", () => {
    assert.equal(landUseAt(50, 0), "asphalt");
    assert.equal(landUseAt(0, 0), "park");
    assert.equal(landUseAt(-92, -78), "orchard");
    const acre = landUseAt(-40, 70);
    assert.ok(acre === "dirt" || acre === "field" || acre === "water");
  });

  it("prefers authored lamp sockets and does not stack them", () => {
    const used: Array<{ x: number; z: number }> = [];
    const rng = seq([0.1, 0.4, 0.7, 0.2, 0.9, 0.35, 0.55]);
    const first = pickLampSocket(used, "stacks", rng);
    assert.equal(first.socket, true);
    used.push(first);
    const second = pickLampSocket(used, "stacks", rng);
    assert.equal(second.socket, true);
    assert.ok(Math.hypot(first.x - second.x, first.z - second.z) > 9);
    assert.ok(LAMP_SOCKETS.some((s) => s.region === "court"));
    assert.ok(LAMP_SOCKETS.filter((s) => s.region === "stacks").length >= 5);
  });

  it("raises mountains on the rim and keeps the court nearly flat", () => {
    assert.ok(heightAt(0, 0) < 0.8);
    assert.ok(heightAt(0, 165) > 8);
    assert.equal(featureAt(0, 165), "ridge");
    assert.equal(featureAt(0, 0), "court");
  });

  it("bakes a height field that still matches the authored ground", () => {
    const exact = heightAt(-48, 28);
    bakeHeightField();
    assert.ok(Math.abs(heightAt(-48, 28) - exact) < 0.8);
    assert.ok(heightAt(0, 0) < 1);
    assert.ok(heightAt(0, 165) > 7);
    resetHeightField();
  });

  it("puts water on the fen and a cave under the hollow", () => {
    assert.equal(isWater(-118, 6), true);
    assert.equal(landUseAt(-118, 6), "water");
    const cave = caveAt(-128, 112);
    assert.ok(cave?.inside);
    assert.ok(WATERWAYS.length >= 3);
  });

  it("keeps a retreat west of court for the bat to lose", () => {
    assert.ok(Math.hypot(RETREAT.x, RETREAT.z) < 40);
    assert.equal(canEscapeBoss("bat", RETREAT.x, RETREAT.z), true);
    assert.equal(canEscapeBoss("wasp", RETREAT.x, RETREAT.z), false);
  });

  it("indexes colliders so flight only tests nearby brick", () => {
    const boxes = [
      { x: 0, y: 2, z: 0, hx: 2, hy: 2, hz: 2, yaw: 0, kind: "solid" as const },
      { x: 80, y: 2, z: 80, hx: 2, hy: 2, hz: 2, yaw: 0, kind: "solid" as const },
    ];
    const index = indexColliders(boxes, 16);
    const near = nearbyColliders(index, 1, 1, 8);
    assert.equal(near.length, 1);
    assert.equal(near[0]?.x, 0);
  });

  it("treats a roof as a floor you can perch on", () => {
    const box = {
      x: 0,
      y: 5,
      z: 0,
      hx: 3,
      hy: 5,
      hz: 3,
      yaw: 0,
      kind: "solid" as const,
    };
    assert.equal(supportY(0, 11, 0, 0.55, [box]), 10);
    assert.equal(supportY(20, 11, 20, 0.55, [box]), null);
    const land = resolveSphere(0, 10.2, 0, 0, -4, 0, 0.55, [box]);
    assert.ok(land.hit);
    assert.ok(land.y >= 10.5);
    assert.ok(land.vy >= 0);
  });

  it("pushes the moth out of a solid box", () => {
    const hit = resolveSphere(0, 2, 0, 4, 0, 0, 0.5, [
      { x: 0, y: 2, z: 0, hx: 1, hy: 2, hz: 1, yaw: 0, kind: "solid" },
    ]);
    assert.equal(hit.hit, true);
    assert.ok(Math.hypot(hit.x, hit.z) >= 0.45);
  });

  it("mixes mite colours and schedules a silent aurora", () => {
    const late = composeFauna(6, seq([0.9, 0.2, 0.8, 0.1, 0.7, 0.3]));
    assert.ok(late.mites.includes("purple") || late.mites.includes("blue"));
    assert.ok(late.beetles >= 1);
    const hues = new Set<string>();
    const rng = seq([0.05, 0.4, 0.9, 0.2]);
    for (let i = 0; i < 12; i++) hues.add(miteForNight(5, rng));
    assert.ok(hues.size >= 2);

    const events = composeEvents(3, seq([0.2, 0.5, 0.1, 0.8, 0.3]));
    const aurora = events.find((e) => e.kind === "aurora");
    assert.ok(aurora);
    assert.equal(aurora?.alert, false);
    assert.ok(events.some((e) => e.kind === "bat" && e.alert));
    assert.equal(auroraScoreMul(true), 1.25);
  });

  it("parses a screenshot data URL and slugs the region", () => {
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const shot = parseShotBody({ dataUrl: png, region: "The Ward · Archive stacks", night: 3 });
    assert.equal(shot.ext, "png");
    assert.equal(shot.region, "the-ward-archive-stacks");
    assert.match(shotFilename(shot.region, 3, "png", 0), /night-moth-.*-n3-the-ward-archive-stacks\.png/);
    assert.equal(slugRegion("Circulation court"), "circulation-court");
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
    const zero = submitScore({
      game: "night-moth",
      score: 0,
      night: 1,
      nectar: 0,
      durationMs: 400,
      initials: "ZIP",
    });
    assert.equal(zero.score, 0);
    assert.ok(!listScores("night-moth").some((s) => s.score === 0));
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

describe("arcade visor prefs", () => {
  it("clamps brightness and radio ids", () => {
    const p = parseArcadePrefs({
      brightness: 9,
      radioIds: [3, "3", 0, -1, 12, 12, "no"],
      radioIndex: 80,
      radioVolume: 4,
      gameVolume: -2,
    });
    assert.ok(p.brightness <= 2.2);
    assert.deepEqual(p.radioIds, [3, 12]);
    assert.equal(p.radioIndex, 1);
    assert.equal(p.radioVolume, 1);
    assert.equal(p.gameVolume, 0);
  });

  it("falls back on garbage json", () => {
    const p = parseArcadePrefsJson("{nope");
    assert.equal(p.brightness, BRIGHTNESS_DEFAULT);
    assert.deepEqual(p.radioIds, []);
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
