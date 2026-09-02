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
import type { ResourceManager } from "./ResourceManager";
import type { BuildingManager } from "./BuildingManager";

const MAX_SPOT_ATTEMPTS = 20;

function inTreeGridBounds(subX: number, subY: number): boolean {
  return subX >= 0 && subY >= 0 && subX < TREE_GRID_WIDTH && subY < TREE_GRID_HEIGHT;
}

export function createForesterBehavior(deps: {
  treeManager: TreeManager;
  buildingManager: BuildingManager;
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

        const center = subTileCenterPx(subX, subY);
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
}): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const home = tileCenterPx(worker.homeTile.x, worker.homeTile.y);
      const radiusPx = worker.config.workRadiusTiles * gridSettings.TILE_SIZE;

      const tree = deps.treeManager.findNearestAvailableTree(home, radiusPx, worker);
      if (!tree) return null;

      tree.reservedBy = worker;
      return { px: tree.container.x, py: tree.container.y, payload: tree };
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      const tree = target.payload as Tree;
      if (deps.treeManager.hasTreeAt(tree.subX, tree.subY)) {
        deps.treeManager.removeTree(tree);
        deps.resourceManager.addWood(1);
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
