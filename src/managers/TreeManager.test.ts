import { describe, expect, it } from "vitest";
import { TreeManager } from "./TreeManager";
import { TREE_SETTINGS } from "../config/gameSettings";
import { createFakeScene } from "../testUtils/fakeScene";
import type { Worker } from "../entities/Worker";

function fakeWorker(): Worker {
  return {} as Worker;
}

describe("TreeManager", () => {
  it("plants a sapling that starts in the growing state", () => {
    const { scene } = createFakeScene();
    const tm = new TreeManager(scene);

    const tree = tm.plantTree(2, 2);

    expect(tree).not.toBeNull();
    expect(tree!.state).toBe("growing");
    expect(tm.hasTreeAt(2, 2)).toBe(true);
    expect(tm.isMature(tree!)).toBe(false);
  });

  it("can plant directly as mature, skipping the growth tween", () => {
    const { scene, tweenCalls } = createFakeScene();
    const tm = new TreeManager(scene);

    const tree = tm.plantTree(2, 2, true);

    expect(tree!.state).toBe("mature");
    expect(tm.isMature(tree!)).toBe(true);
    expect(tweenCalls).toHaveLength(0);
  });

  it("refuses to plant where a tree already exists", () => {
    const { scene } = createFakeScene();
    const tm = new TreeManager(scene);

    tm.plantTree(2, 2);
    expect(tm.plantTree(2, 2)).toBeNull();
  });

  it("becomes mature once its growth tween completes", () => {
    const { scene, tweenCalls } = createFakeScene();
    const tm = new TreeManager(scene);

    const tree = tm.plantTree(2, 2);
    expect(tweenCalls).toHaveLength(1);

    tweenCalls[0].onComplete();

    expect(tree!.state).toBe("mature");
    expect(tm.isMature(tree!)).toBe(true);
  });

  it("turns into a stump when chopped, and starts a regrowth countdown", () => {
    const { scene } = createFakeScene();
    const tm = new TreeManager(scene);
    const tree = tm.plantTree(2, 2, true);

    tm.convertToStump(tree!);

    expect(tree!.state).toBe("stump");
    expect(tree!.stumpTimer).toBe(TREE_SETTINGS.stumpDurationMs);
    expect(tree!.reservedBy).toBeNull();
  });

  it("regrows once the stump timer expires", () => {
    const { scene, tweenCalls } = createFakeScene();
    const tm = new TreeManager(scene);
    const tree = tm.plantTree(2, 2, true);
    tm.convertToStump(tree!);

    tm.updateStumpRegrowth(TREE_SETTINGS.stumpDurationMs);

    expect(tree!.state).toBe("growing");
    expect(tweenCalls).toHaveLength(1);
  });

  it("does not regrow before the stump timer expires", () => {
    const { scene } = createFakeScene();
    const tm = new TreeManager(scene);
    const tree = tm.plantTree(2, 2, true);
    tm.convertToStump(tree!);

    tm.updateStumpRegrowth(TREE_SETTINGS.stumpDurationMs - 1);

    expect(tree!.state).toBe("stump");
  });

  it("tickNaturalGrowthTimer only fires once the cooldown elapses, then resets it", () => {
    const { scene } = createFakeScene();
    const tm = new TreeManager(scene);

    // Drain the (randomized, but bounded) timer in one very large step.
    const fired = tm.tickNaturalGrowthTimer(TREE_SETTINGS.naturalGrowthMaxMs);
    expect(fired).toBe(true);

    // Immediately after reset, a tiny step should not fire again.
    expect(tm.tickNaturalGrowthTimer(1)).toBe(false);
  });

  describe("building-tile occupancy", () => {
    it("detects and clears trees within a building's footprint", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      // Building tile (1,1) covers sub-tiles (2,2)-(3,3) at SUB_TILES_PER_TILE=2.
      tm.plantTree(2, 2, true);

      expect(tm.hasAnyTreeInBuildingTile(1, 1)).toBe(true);

      tm.clearTreesInBuildingTile(1, 1);

      expect(tm.hasAnyTreeInBuildingTile(1, 1)).toBe(false);
      expect(tm.hasTreeAt(2, 2)).toBe(false);
    });

    it("ignores stumps when checking for occupancy", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const tree = tm.plantTree(2, 2, true);
      tm.convertToStump(tree!);

      expect(tm.hasAnyTreeInBuildingTile(1, 1)).toBe(false);
    });
  });

  describe("findNearestAvailableTree", () => {
    it("picks the closest mature, unreserved tree within radius", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const worker = fakeWorker();

      const far = tm.plantTree(10, 10, true)!;
      const near = tm.plantTree(2, 2, true)!;

      const found = tm.findNearestAvailableTree({ x: 0, y: 0 }, 1000, worker);

      expect(found).toBe(near);
      expect(found).not.toBe(far);
    });

    it("excludes trees reserved by a different worker", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const workerA = fakeWorker();
      const workerB = fakeWorker();

      const tree = tm.plantTree(2, 2, true)!;
      tree.reservedBy = workerA;

      expect(tm.findNearestAvailableTree({ x: 0, y: 0 }, 1000, workerB)).toBeNull();
      expect(tm.findNearestAvailableTree({ x: 0, y: 0 }, 1000, workerA)).toBe(tree);
    });

    it("excludes trees outside the search radius", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const worker = fakeWorker();
      tm.plantTree(50, 50, true);

      expect(tm.findNearestAvailableTree({ x: 0, y: 0 }, 10, worker)).toBeNull();
    });

    it("excludes trees the isBlocked callback rejects", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const worker = fakeWorker();
      tm.plantTree(2, 2, true);

      const found = tm.findNearestAvailableTree({ x: 0, y: 0 }, 1000, worker, () => true);

      expect(found).toBeNull();
    });

    it("ignores immature trees", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const worker = fakeWorker();
      tm.plantTree(2, 2, false);

      expect(tm.findNearestAvailableTree({ x: 0, y: 0 }, 1000, worker)).toBeNull();
    });
  });

  describe("findNearestMatureTree", () => {
    it("ignores reservations entirely", () => {
      const { scene } = createFakeScene();
      const tm = new TreeManager(scene);
      const tree = tm.plantTree(2, 2, true)!;
      tree.reservedBy = fakeWorker();

      expect(tm.findNearestMatureTree({ x: 0, y: 0 }, 1000)).toBe(tree);
    });
  });
});
