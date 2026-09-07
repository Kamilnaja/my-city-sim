import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RiverManager } from "./RiverManager";
import { tileCenterPx } from "../scenes/gridSettings";
import { createFakeScene } from "../testUtils/fakeScene";

// Phaser.Math.Between(min, max) = floor(random() * (max - min + 1) + min), and
// Phaser.Utils.Array.GetRandom(arr) = arr[floor(random() * arr.length)]. Pinning random()
// to 0 always yields `min` / the first array element, which makes generateRiver's otherwise
// randomized walk fully deterministic: orientation "vertical", starting column 6, drifting
// left by one row each step until it clamps at column 1 (see inline trace below).
function makeDeterministicRiver(): RiverManager {
  const { scene } = createFakeScene();
  const river = new RiverManager(scene);
  vi.spyOn(Math, "random").mockReturnValue(0);
  river.generateRiver();
  return river;
}

// With GRID_WIDTH/HEIGHT = 20: x starts at floor(20*0.3) = 6 and decreases by 1 every row
// (clamped to a minimum of 1), producing tiles (6,0) (5,1) (4,2) (3,3) (2,4) (1,5) (1,6) ... (1,19).
const EXPECTED_PATH: [number, number][] = [
  [6, 0],
  [5, 1],
  [4, 2],
  [3, 3],
  [2, 4],
  [1, 5],
  ...Array.from({ length: 14 }, (_, i) => [1, 6 + i] as [number, number]),
];

describe("RiverManager", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("carves the expected deterministic path when the RNG is pinned", () => {
    const river = makeDeterministicRiver();
    for (const [x, y] of EXPECTED_PATH) {
      expect(river.isRiver(x, y)).toBe(true);
    }
    expect(river.isRiver(0, 0)).toBe(false);
    expect(river.isRiver(10, 10)).toBe(false);
  });

  it("treats river tiles as impassable and dry land as passable", () => {
    const river = makeDeterministicRiver();
    expect(river.isPassable(1, 10)).toBe(false);
    expect(river.isPassable(0, 0)).toBe(true);
  });

  it("detects near-river tiles including diagonal neighbors", () => {
    const river = makeDeterministicRiver();
    // (5,1) is a diagonal neighbor of (6,0), and both are on the path.
    expect(river.isNearRiver(6, 0)).toBe(true);
    expect(river.isNearRiver(19, 19)).toBe(false);
  });

  describe("bridges", () => {
    let river: RiverManager;

    beforeEach(() => {
      river = makeDeterministicRiver();
    });

    it("can only be built on river tiles", () => {
      expect(river.buildBridge(0, 0)).toBe(false);
      expect(river.hasBridge(0, 0)).toBe(false);
    });

    it("makes a river tile passable once built", () => {
      expect(river.buildBridge(1, 10)).toBe(true);
      expect(river.hasBridge(1, 10)).toBe(true);
      expect(river.isPassable(1, 10)).toBe(true);
    });

    it("refuses to double-build on the same tile", () => {
      expect(river.buildBridge(1, 10)).toBe(true);
      expect(river.buildBridge(1, 10)).toBe(false);
    });

    it("can be removed, restoring impassability", () => {
      river.buildBridge(1, 10);
      expect(river.removeBridge(1, 10)).toBe(true);
      expect(river.hasBridge(1, 10)).toBe(false);
      expect(river.isPassable(1, 10)).toBe(false);
    });

    it("removal is a no-op when there's no bridge there", () => {
      expect(river.removeBridge(1, 10)).toBe(false);
    });
  });

  describe("segment crossing", () => {
    let river: RiverManager;

    beforeEach(() => {
      river = makeDeterministicRiver();
    });

    it("detects a straight segment crossing unbridged water", () => {
      const center = tileCenterPx(1, 10);
      const crosses = river.segmentCrossesRiver(center.x - 100, center.y, center.x + 100, center.y);
      expect(crosses).toBe(true);
    });

    it("stops detecting a crossing once the tile is bridged", () => {
      const center = tileCenterPx(1, 10);
      river.buildBridge(1, 10);
      const crosses = river.segmentCrossesRiver(center.x - 100, center.y, center.x + 100, center.y);
      expect(crosses).toBe(false);
    });

    it("does not flag a segment that stays on dry land", () => {
      const a = tileCenterPx(15, 15);
      const b = tileCenterPx(17, 15);
      expect(river.segmentCrossesRiver(a.x, a.y, b.x, b.y)).toBe(false);
    });

    it("segmentPassesThroughTile ignores bridges entirely", () => {
      const center = tileCenterPx(1, 10);
      river.buildBridge(1, 10);
      const passes = river.segmentPassesThroughTile(
        center.x - 100,
        center.y,
        center.x + 100,
        center.y,
        1,
        10,
      );
      expect(passes).toBe(true);
    });
  });
});
