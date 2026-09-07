import { describe, expect, it } from "vitest";
import { BuildingManager } from "./BuildingManager";
import { TreeManager } from "./TreeManager";
import { ResourceManager } from "./ResourceManager";
import { DeerManager } from "./DeerManager";
import { RiverManager } from "./RiverManager";
import { BUILDING_TYPES } from "../config/buildingTypes";
import { BUILDING_UPGRADE_SETTINGS } from "../config/gameSettings";
import { createFakeScene } from "../testUtils/fakeScene";

function setup() {
  const { scene } = createFakeScene();
  const treeManager = new TreeManager(scene);
  const resourceManager = new ResourceManager({ wood: 999 });
  const riverManager = new RiverManager(scene);
  const deerManager = new DeerManager(scene, riverManager, treeManager);
  const buildingManager = new BuildingManager(scene, treeManager, resourceManager, deerManager, riverManager);
  return { buildingManager, treeManager, resourceManager, deerManager, riverManager };
}

describe("BuildingManager", () => {
  it("places a building with one worker slot and no upgrade level", () => {
    const { buildingManager } = setup();

    const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 3, 3);

    expect(building).not.toBeNull();
    expect(building!.level).toBe(0);
    expect(building!.slots).toHaveLength(1);
    expect(building!.slots[0].worker).not.toBeNull();
    expect(buildingManager.isTileOccupied(3, 3)).toBe(true);
  });

  it("refuses to place on an already-occupied tile", () => {
    const { buildingManager } = setup();
    buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 3, 3);

    const second = buildingManager.placeBuilding(BUILDING_TYPES.forester, 3, 3);

    expect(second).toBeNull();
  });

  it("tracks building and worker counts across placements", () => {
    const { buildingManager } = setup();
    buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 1, 1);
    buildingManager.placeBuilding(BUILDING_TYPES.forester, 2, 2);

    expect(buildingManager.getBuildingCount()).toBe(2);
    expect(buildingManager.getWorkerCount()).toBe(2);
  });

  describe("upgrades", () => {
    it("costs (level + 1) * base cost, and reports null past max level", () => {
      const { buildingManager } = setup();
      const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0)!;

      expect(buildingManager.getUpgradeCost(building)).toBe(1 * BUILDING_TYPES.woodcutter.cost);

      for (let i = 0; i < BUILDING_UPGRADE_SETTINGS.maxLevel; i++) {
        buildingManager.upgradeBuilding(building);
      }

      expect(building.level).toBe(BUILDING_UPGRADE_SETTINGS.maxLevel);
      expect(buildingManager.getUpgradeCost(building)).toBeNull();
      expect(buildingManager.upgradeBuilding(building)).toBe(false);
    });

    it("adds one worker slot per level", () => {
      const { buildingManager } = setup();
      const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0)!;

      buildingManager.upgradeBuilding(building);
      expect(building.slots).toHaveLength(2);

      buildingManager.upgradeBuilding(building);
      expect(building.slots).toHaveLength(3);
    });
  });

  describe("removal", () => {
    it("frees the tile and destroys all of the building's workers", () => {
      const { buildingManager } = setup();
      const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 5, 5)!;
      buildingManager.upgradeBuilding(building);
      const workers = building.slots.map((s) => s.worker!);

      const removed = buildingManager.removeBuildingAt(5, 5);

      expect(removed).toBe(building);
      expect(buildingManager.isTileOccupied(5, 5)).toBe(false);
      for (const w of workers) expect(buildingManager.hasWorker(w)).toBe(false);
    });

    it("returns null when removing an empty tile", () => {
      const { buildingManager } = setup();
      expect(buildingManager.removeBuildingAt(9, 9)).toBeNull();
    });
  });

  describe("worker lifecycle", () => {
    it("killWorker clears the slot and starts a respawn countdown", () => {
      const { buildingManager } = setup();
      const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0)!;
      const worker = building.slots[0].worker!;

      expect(buildingManager.killWorker(worker)).toBe(true);

      expect(building.slots[0].worker).toBeNull();
      expect(buildingManager.hasWorker(worker)).toBe(false);
      expect(buildingManager.getWorkerCount()).toBe(0);
    });

    it("killWorker returns false for a worker it doesn't own", () => {
      const { buildingManager } = setup();
      buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0);
      const other = buildingManager.placeBuilding(BUILDING_TYPES.forester, 1, 1)!;
      buildingManager.removeBuildingAt(1, 1);

      expect(buildingManager.killWorker(other.slots[0].worker!)).toBe(false);
    });

    it("respawns a new worker into an empty slot once the respawn timer elapses", () => {
      const { buildingManager } = setup();
      const building = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0)!;
      const worker = building.slots[0].worker!;
      buildingManager.killWorker(worker);

      buildingManager.updateWorkers(1); // timer still counting down
      expect(building.slots[0].worker).toBeNull();

      buildingManager.updateWorkers(999_999); // well past the respawn delay
      expect(building.slots[0].worker).not.toBeNull();
      expect(building.slots[0].worker).not.toBe(worker);
    });

    it("getActiveWorkers only lists workers currently alive", () => {
      const { buildingManager } = setup();
      const a = buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, 0, 0)!;
      buildingManager.placeBuilding(BUILDING_TYPES.forester, 1, 1)!;
      buildingManager.killWorker(a.slots[0].worker!);

      expect(buildingManager.getActiveWorkers()).toHaveLength(1);
    });
  });
});
