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
import { RESOURCE_SETTINGS } from "../config/gameSettings";
import type { Worker, WorkerBehavior, WorkTarget } from "../entities/Worker";
import type { Tree } from "./TreeManager";
import type { TreeManager } from "./TreeManager";
import type { Deer } from "./DeerManager";
import type { DeerManager } from "./DeerManager";
import type { Wolf } from "./WolfManager";
import type { WolfManager } from "./WolfManager";
import type { ResourceManager } from "./ResourceManager";
import type { BuildingManager } from "./BuildingManager";
import type { RiverManager } from "./RiverManager";

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

      const homeSubX = Math.floor(home.x / SUB_TILE_SIZE);
      const homeSubY = Math.floor(home.y / SUB_TILE_SIZE);
      const subRadius = Math.ceil(radiusPx / SUB_TILE_SIZE);

      // Reforest outward from the hut: scan every empty slot in range and take the
      // closest one, instead of picking a random spot anywhere within the radius.
      let closest: { subX: number; subY: number; distSq: number }[] = [];
      let closestDistSq = Infinity;

      for (let dx = -subRadius; dx <= subRadius; dx++) {
        for (let dy = -subRadius; dy <= subRadius; dy++) {
          const subX = homeSubX + dx;
          const subY = homeSubY + dy;

          if (!inTreeGridBounds(subX, subY)) continue;
          if (deps.treeManager.hasTreeAt(subX, subY)) continue;

          const parentGridX = Math.floor(subX / SUB_TILES_PER_TILE);
          const parentGridY = Math.floor(subY / SUB_TILES_PER_TILE);
          if (deps.buildingManager.isTileOccupied(parentGridX, parentGridY)) continue;
          if (deps.riverManager.isRiver(parentGridX, parentGridY)) continue;

          const center = subTileCenterPx(subX, subY);
          const ddx = center.x - home.x;
          const ddy = center.y - home.y;
          if (Math.abs(ddx) > radiusPx || Math.abs(ddy) > radiusPx) continue;
          if (deps.riverManager.segmentCrossesRiver(home.x, home.y, center.x, center.y)) continue;

          const distSq = ddx * ddx + ddy * ddy;
          if (distSq < closestDistSq) {
            closestDistSq = distSq;
            closest = [{ subX, subY, distSq }];
          } else if (distSq === closestDistSq) {
            closest.push({ subX, subY, distSq });
          }
        }
      }

      if (closest.length === 0) return null;

      // Several slots often tie for closest (e.g. the 4 diagonal neighbors) — pick
      // randomly among them so growth doesn't always favor the same direction.
      const chosen = Phaser.Utils.Array.GetRandom(closest);
      const center = subTileCenterPx(chosen.subX, chosen.subY);
      return { px: center.x, py: center.y, payload: { subX: chosen.subX, subY: chosen.subY } };
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
      // Re-check maturity too: it may already be a stump (chopped by another worker,
      // or grazed by a deer) despite still existing as an entity in that slot.
      if (deps.treeManager.hasTreeAt(tree.subX, tree.subY) && deps.treeManager.isMature(tree)) {
        deps.treeManager.convertToStump(tree);
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

export interface HuntsmanDeps {
  deerManager: DeerManager;
  // Nullable: WolfManager depends on BuildingManager, so it can't exist yet when this
  // behavior is first created. GameScene fills it in right after via setWolfManager().
  wolfManager: WolfManager | null;
  resourceManager: ResourceManager;
  riverManager: RiverManager;
}

type HuntTarget = { kind: "deer"; deer: Deer } | { kind: "wolf"; wolf: Wolf };

export function createHuntsmanBehavior(deps: HuntsmanDeps): WorkerBehavior {
  return {
    findTarget(worker: Worker): WorkTarget | null {
      const home = tileCenterPx(worker.homeTile.x, worker.homeTile.y);
      const radiusPx = worker.config.workRadiusTiles * gridSettings.TILE_SIZE;
      const isBlocked = (px: number, py: number) =>
        deps.riverManager.segmentCrossesRiver(home.x, home.y, px, py);

      const deer = deps.deerManager.findNearestAvailableDeer(home, radiusPx, worker, isBlocked);
      const wolf = deps.wolfManager?.findNearestAvailableWolf(home, radiusPx, worker, isBlocked) ?? null;

      const deerDistSq = deer
        ? (deer.container.x - home.x) ** 2 + (deer.container.y - home.y) ** 2
        : Infinity;
      const wolfDistSq = wolf
        ? (wolf.container.x - home.x) ** 2 + (wolf.container.y - home.y) ** 2
        : Infinity;

      let target: HuntTarget | null = null;
      if (deer && deerDistSq <= wolfDistSq) {
        deer.reservedBy = worker;
        target = { kind: "deer", deer };
      } else if (wolf) {
        wolf.reservedBy = worker;
        target = { kind: "wolf", wolf };
      }

      if (!target) return null;
      const pos =
        target.kind === "deer"
          ? { x: target.deer.container.x, y: target.deer.container.y }
          : { x: target.wolf.container.x, y: target.wolf.container.y };
      return { px: pos.x, py: pos.y, payload: target };
    },

    onWorkComplete(_worker: Worker, workTarget: WorkTarget): void {
      const target = workTarget.payload as HuntTarget;
      if (target.kind === "deer") {
        if (deps.deerManager.hasDeer(target.deer)) {
          deps.deerManager.removeDeer(target.deer);
          deps.resourceManager.add("meat", RESOURCE_SETTINGS.meatPerHunt);
        }
      } else if (deps.wolfManager?.hasWolf(target.wolf)) {
        deps.wolfManager.removeWolf(target.wolf);
        deps.resourceManager.add("meat", RESOURCE_SETTINGS.meatPerHunt);
      }
    },

    onCancel(worker: Worker, workTarget: WorkTarget): void {
      const target = workTarget.payload as HuntTarget;
      if (target.kind === "deer") {
        if (target.deer.reservedBy === worker) target.deer.reservedBy = null;
      } else if (target.wolf.reservedBy === worker) {
        target.wolf.reservedBy = null;
      }
    },
  };
}
