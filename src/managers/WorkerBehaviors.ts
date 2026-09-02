import * as Phaser from "phaser";
import {
  gridSettings,
  SUB_TILE_SIZE,
  SUB_TILES_PER_TILE,
  TREE_GRID_WIDTH,
  TREE_GRID_HEIGHT,
  tileCenterPx,
  subTileCenterPx,
} from "../scenes/gridSettings";
import type { Worker, WorkerBehavior, WorkTarget } from "../entities/Worker";
import type { Tree } from "./TreeManager";
import type { TreeManager } from "./TreeManager";
import type { Deer } from "./DeerManager";
import type { DeerManager } from "./DeerManager";
import type { ResourceManager } from "./ResourceManager";
import type { BuildingManager } from "./BuildingManager";
import type { RiverManager } from "./RiverManager";

const MAX_SPOT_ATTEMPTS = 20;
const MEAT_PER_HUNT = 3;

function inTreeGridBounds(subX: number, subY: number): boolean {
  return subX >= 0 && subY >= 0 && subX < TREE_GRID_WIDTH && subY < TREE_GRID_HEIGHT;
}

export function createForesterBehavior(deps: {
  treeManager: TreeManager;
  buildingManager: BuildingManager;
  riverManager: RiverManager;
}): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const home = tileCenterPx(worker.homeTile.x, worker.homeTile.y);
      const radiusPx = worker.config.workRadiusTiles * gridSettings.TILE_SIZE;

      for (let attempt = 0; attempt < MAX_SPOT_ATTEMPTS; attempt++) {
        const px = home.x + Phaser.Math.Between(-radiusPx, radiusPx);
        const py = home.y + Phaser.Math.Between(-radiusPx, radiusPx);

        const subX = Math.floor(px / SUB_TILE_SIZE);
        const subY = Math.floor(py / SUB_TILE_SIZE);

        if (!inTreeGridBounds(subX, subY)) continue;
        if (deps.treeManager.hasTreeAt(subX, subY)) continue;

        const parentGridX = Math.floor(subX / SUB_TILES_PER_TILE);
        const parentGridY = Math.floor(subY / SUB_TILES_PER_TILE);
        if (deps.buildingManager.isTileOccupied(parentGridX, parentGridY)) continue;
        if (deps.riverManager.isRiver(parentGridX, parentGridY)) continue;

        const center = subTileCenterPx(subX, subY);
        if (deps.riverManager.segmentCrossesRiver(home.x, home.y, center.x, center.y)) continue;

        return { px: center.x, py: center.y, payload: { subX, subY } };
      }

      return null;
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      const { subX, subY } = target.payload as { subX: number; subY: number };
      if (!deps.treeManager.hasTreeAt(subX, subY)) {
        deps.treeManager.plantTree(subX, subY);
      }
    },
  };
}

export function createWoodcutterBehavior(deps: {
  treeManager: TreeManager;
  resourceManager: ResourceManager;
  riverManager: RiverManager;
}): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const home = tileCenterPx(worker.homeTile.x, worker.homeTile.y);
      const radiusPx = worker.config.workRadiusTiles * gridSettings.TILE_SIZE;

      const tree = deps.treeManager.findNearestAvailableTree(home, radiusPx, worker, (px, py) =>
        deps.riverManager.segmentCrossesRiver(home.x, home.y, px, py),
      );
      if (!tree) return null;

      tree.reservedBy = worker;
      return { px: tree.container.x, py: tree.container.y, payload: tree };
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      const tree = target.payload as Tree;
      if (deps.treeManager.hasTreeAt(tree.subX, tree.subY)) {
        deps.treeManager.removeTree(tree);
        deps.resourceManager.add("wood", 1);
      }
    },

    onCancel(worker: Worker, target: WorkTarget): void {
      const tree = target.payload as Tree;
      if (tree.reservedBy === worker) {
        tree.reservedBy = null;
      }
    },
  };
}

export function createHuntsmanBehavior(deps: {
  deerManager: DeerManager;
  resourceManager: ResourceManager;
  riverManager: RiverManager;
}): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const home = tileCenterPx(worker.homeTile.x, worker.homeTile.y);
      const radiusPx = worker.config.workRadiusTiles * gridSettings.TILE_SIZE;

      const deer = deps.deerManager.findNearestAvailableDeer(home, radiusPx, worker, (px, py) =>
        deps.riverManager.segmentCrossesRiver(home.x, home.y, px, py),
      );
      if (!deer) return null;

      deer.reservedBy = worker;
      return { px: deer.container.x, py: deer.container.y, payload: deer };
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      const deer = target.payload as Deer;
      if (deps.deerManager.hasDeerAt(deer.gridX, deer.gridY)) {
        deps.deerManager.removeDeer(deer);
        deps.resourceManager.add("meat", MEAT_PER_HUNT);
      }
    },

    onCancel(worker: Worker, target: WorkTarget): void {
      const deer = target.payload as Deer;
      if (deer.reservedBy === worker) {
        deer.reservedBy = null;
      }
    },
  };
}
