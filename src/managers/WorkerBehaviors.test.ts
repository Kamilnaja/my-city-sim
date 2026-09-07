import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createForesterBehavior,
  createWoodcutterBehavior,
  createHuntsmanBehavior,
  createFishermanBehavior,
} from "./WorkerBehaviors";
import { TreeManager } from "./TreeManager";
import { ResourceManager } from "./ResourceManager";
import { DeerManager } from "./DeerManager";
import { WolfManager } from "./WolfManager";
import { RiverManager } from "./RiverManager";
import { BuildingManager } from "./BuildingManager";
import { BUILDING_TYPES } from "../config/buildingTypes";
import { RESOURCE_SETTINGS } from "../config/gameSettings";
import { SUB_TILES_PER_TILE, tileCenterPx } from "../scenes/gridSettings";
import { createFakeScene } from "../testUtils/fakeScene";
import type { Worker } from "../entities/Worker";

/** Behaviors only ever read `homeTile` and `config.workRadiusTiles` off the worker they're given. */
function fakeWorker(homeGridX: number, homeGridY: number, workRadiusTiles = 6): Worker {
  return {
    homeTile: { x: homeGridX, y: homeGridY },
    config: { ...BUILDING_TYPES.woodcutter, workRadiusTiles },
  } as unknown as Worker;
}

function fullSetup() {
  const { scene } = createFakeScene();
  const treeManager = new TreeManager(scene);
  const resourceManager = new ResourceManager();
  const riverManager = new RiverManager(scene);
  const deerManager = new DeerManager(scene, riverManager, treeManager);
  const buildingManager = new BuildingManager(scene, treeManager, resourceManager, deerManager, riverManager);
  const wolfManager = new WolfManager(scene, riverManager, deerManager, buildingManager);
  return { scene, treeManager, resourceManager, riverManager, deerManager, buildingManager, wolfManager };
}

describe("forester behavior", () => {
  it("plants a tree in the nearest empty slot within radius on work completion", () => {
    const { treeManager, riverManager, buildingManager } = fullSetup();
    const behavior = createForesterBehavior({ treeManager, buildingManager, riverManager });
    const worker = fakeWorker(5, 5, 1);

    const target = behavior.findTarget(worker);
    expect(target).not.toBeNull();

    behavior.onWorkComplete(worker, target!);

    const { subX, subY } = target!.payload as { subX: number; subY: number };
    expect(treeManager.hasTreeAt(subX, subY)).toBe(true);
  });

  it("never targets a slot under the hut's own building tile", () => {
    const { treeManager, riverManager, buildingManager } = fullSetup();
    buildingManager.placeBuilding(BUILDING_TYPES.forester, 5, 5);
    const behavior = createForesterBehavior({ treeManager, buildingManager, riverManager });
    const worker = fakeWorker(5, 5, 1);

    const target = behavior.findTarget(worker);

    expect(target).not.toBeNull();
    const { subX, subY } = target!.payload as { subX: number; subY: number };
    const parentGridX = Math.floor(subX / SUB_TILES_PER_TILE);
    const parentGridY = Math.floor(subY / SUB_TILES_PER_TILE);
    expect(parentGridX === 5 && parentGridY === 5).toBe(false);
  });

  it("returns null once every slot in radius is already planted", () => {
    const { treeManager, riverManager, buildingManager } = fullSetup();
    const behavior = createForesterBehavior({ treeManager, buildingManager, riverManager });
    const worker = fakeWorker(5, 5, 1);

    // Radius 1 tile => a small, exhaustible sub-grid window around the hut.
    for (let i = 0; i < 50; i++) {
      const target = behavior.findTarget(worker);
      if (!target) break;
      const { subX, subY } = target.payload as { subX: number; subY: number };
      treeManager.plantTree(subX, subY, true);
    }

    expect(behavior.findTarget(worker)).toBeNull();
  });
});

describe("woodcutter behavior", () => {
  it("reserves the nearest mature tree, chops it, and pays out wood on completion", () => {
    const { treeManager, resourceManager, riverManager } = fullSetup();
    const behavior = createWoodcutterBehavior({ treeManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5);
    const tree = treeManager.plantTree(10, 10, true)!;

    const target = behavior.findTarget(worker);

    expect(target?.payload).toBe(tree);
    expect(tree.reservedBy).toBe(worker);

    behavior.onWorkComplete(worker, target!);

    expect(tree.state).toBe("stump");
    expect(resourceManager.get("wood")).toBe(1);
  });

  it("does not offer a tree already reserved by another worker", () => {
    const { treeManager, resourceManager, riverManager } = fullSetup();
    const behavior = createWoodcutterBehavior({ treeManager, resourceManager, riverManager });
    const workerA = fakeWorker(5, 5);
    const workerB = fakeWorker(5, 5);
    const tree = treeManager.plantTree(10, 10, true)!;
    tree.reservedBy = workerA;

    expect(behavior.findTarget(workerB)).toBeNull();
  });

  it("frees its reservation via onCancel without paying out wood", () => {
    const { treeManager, resourceManager, riverManager } = fullSetup();
    const behavior = createWoodcutterBehavior({ treeManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5);
    const tree = treeManager.plantTree(10, 10, true)!;

    const target = behavior.findTarget(worker)!;
    behavior.onCancel?.(worker, target);

    expect(tree.reservedBy).toBeNull();
    expect(resourceManager.get("wood")).toBe(0);
  });

  it("does not pay out wood if the tree was chopped by someone else first", () => {
    const { treeManager, resourceManager, riverManager } = fullSetup();
    const behavior = createWoodcutterBehavior({ treeManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5);
    const tree = treeManager.plantTree(10, 10, true)!;
    const target = behavior.findTarget(worker)!;

    treeManager.convertToStump(tree); // e.g. a deer grazed it first

    behavior.onWorkComplete(worker, target);

    expect(resourceManager.get("wood")).toBe(0);
  });
});

describe("huntsman behavior", () => {
  it("prefers the closer of an available deer and wolf", () => {
    const { deerManager, wolfManager, resourceManager, riverManager } = fullSetup();
    const deps = { deerManager, wolfManager, resourceManager, riverManager };
    const behavior = createHuntsmanBehavior(deps);
    const worker = fakeWorker(5, 5, 9);

    const deer = deerManager.spawnDeer(6, 5)!; // 1 tile away
    const wolf = wolfManager.spawnWolf(9, 5)!; // farther away

    const target = behavior.findTarget(worker);

    expect(target?.payload).toEqual({ kind: "deer", deer });
    expect(deer.reservedBy).toBe(worker);
    expect(wolf.reservedBy).toBeNull();
  });

  it("hunts a deer for meat on completion", () => {
    const { deerManager, wolfManager, resourceManager, riverManager } = fullSetup();
    const behavior = createHuntsmanBehavior({ deerManager, wolfManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5, 9);
    deerManager.spawnDeer(6, 5);

    const target = behavior.findTarget(worker)!;
    behavior.onWorkComplete(worker, target);

    expect(resourceManager.get("meat")).toBe(RESOURCE_SETTINGS.meatPerHunt);
    expect(deerManager.count).toBe(0);
  });

  it("falls back to a wolf when no deer is available, and pays out meat too", () => {
    const { deerManager, wolfManager, resourceManager, riverManager } = fullSetup();
    const behavior = createHuntsmanBehavior({ deerManager, wolfManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5, 9);
    const wolf = wolfManager.spawnWolf(6, 5)!;

    const target = behavior.findTarget(worker)!;
    expect(target.payload).toEqual({ kind: "wolf", wolf });

    behavior.onWorkComplete(worker, target);

    expect(resourceManager.get("meat")).toBe(RESOURCE_SETTINGS.meatPerHunt);
    expect(wolfManager.count).toBe(0);
  });

  it("frees whichever reservation it held via onCancel", () => {
    const { deerManager, wolfManager, resourceManager, riverManager } = fullSetup();
    const behavior = createHuntsmanBehavior({ deerManager, wolfManager, resourceManager, riverManager });
    const worker = fakeWorker(5, 5, 9);
    const deer = deerManager.spawnDeer(6, 5)!;

    const target = behavior.findTarget(worker)!;
    behavior.onCancel?.(worker, target);

    expect(deer.reservedBy).toBeNull();
  });
});

describe("fisherman behavior", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("targets a point on the dry bank next to an adjacent river tile", () => {
    const { riverManager, resourceManager } = fullSetup();
    // Deterministic river (see RiverManager.test.ts): pins Math.random so the walk always
    // starts at (6,0) and drifts to column 1 — tile (1,10) ends up in the river.
    vi.spyOn(Math, "random").mockReturnValue(0);
    riverManager.generateRiver();
    const behavior = createFishermanBehavior({ resourceManager, riverManager });
    // Home tile adjacent to the known river tile (1,10).
    const worker = fakeWorker(0, 10);

    const target = behavior.findTarget(worker);

    expect(target).not.toBeNull();
    const home = tileCenterPx(0, 10);
    const river = tileCenterPx(1, 10);
    // The chosen point sits strictly between home and the river tile's center.
    expect(target!.px).toBeGreaterThan(home.x);
    expect(target!.px).toBeLessThan(river.x);
  });

  it("returns null with no river tile adjacent to home", () => {
    const { riverManager, resourceManager } = fullSetup(); // no generateRiver() called
    const behavior = createFishermanBehavior({ resourceManager, riverManager });
    const worker = fakeWorker(10, 10);

    expect(behavior.findTarget(worker)).toBeNull();
  });

  it("pays out meat on work completion", () => {
    const { riverManager, resourceManager } = fullSetup();
    const behavior = createFishermanBehavior({ resourceManager, riverManager });
    const worker = fakeWorker(10, 10);

    behavior.onWorkComplete(worker, { px: 0, py: 0 });

    expect(resourceManager.get("meat")).toBe(RESOURCE_SETTINGS.meatPerFish);
  });
});
