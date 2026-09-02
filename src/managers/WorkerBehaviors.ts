import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";
import type { Worker, WorkerBehavior, WorkTarget } from "../entities/Worker";
import type { Tree } from "./TreeManager";
import type { TreeManager } from "./TreeManager";
import type { ResourceManager } from "./ResourceManager";
import type { BuildingManager } from "./BuildingManager";

const MAX_SPOT_ATTEMPTS = 20;

function inBounds(x: number, y: number): boolean {
  return (
    x >= 0 && y >= 0 && x < gridSettings.GRID_WIDTH && y < gridSettings.GRID_HEIGHT
  );
}

export function createForesterBehavior(deps: {
  treeManager: TreeManager;
  buildingManager: BuildingManager;
}): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const radius = worker.config.workRadiusTiles;

      for (let attempt = 0; attempt < MAX_SPOT_ATTEMPTS; attempt++) {
        const x = worker.homeTile.x + Phaser.Math.Between(-radius, radius);
        const y = worker.homeTile.y + Phaser.Math.Between(-radius, radius);

        if (!inBounds(x, y)) continue;
        if (deps.treeManager.hasTreeAt(x, y)) continue;
        if (deps.buildingManager.isTileOccupied(x, y)) continue;

        return { tileX: x, tileY: y };
      }

      return null;
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      if (!deps.treeManager.hasTreeAt(target.tileX, target.tileY)) {
        deps.treeManager.plantTree(target.tileX, target.tileY);
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
      const tree = deps.treeManager.findNearestAvailableTree(
        worker.homeTile.x,
        worker.homeTile.y,
        worker.config.workRadiusTiles,
        worker,
      );
      if (!tree) return null;

      tree.reservedBy = worker;
      return { tileX: tree.gridX, tileY: tree.gridY, payload: tree };
    },

    onWorkComplete(_worker: Worker, target: WorkTarget): void {
      const tree = target.payload as Tree;
      if (deps.treeManager.hasTreeAt(tree.gridX, tree.gridY)) {
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
