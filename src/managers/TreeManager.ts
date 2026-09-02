import * as Phaser from "phaser";
import { SUB_TILES_PER_TILE, subTileCenterPx } from "../scenes/gridSettings";
import type { Worker } from "../entities/Worker";

const GROWTH_DURATION_MS = 6000;

export interface Tree {
  subX: number;
  subY: number;
  plantedAt: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
}

export class TreeManager {
  private scene: Phaser.Scene;
  private trees = new Map<string, Tree>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private key(subX: number, subY: number): string {
    return `${subX},${subY}`;
  }

  hasTreeAt(subX: number, subY: number): boolean {
    return this.trees.has(this.key(subX, subY));
  }

  /** True if any of the (SUB_TILES_PER_TILE)^2 tree slots inside a building tile is occupied. */
  hasAnyTreeInBuildingTile(gridX: number, gridY: number): boolean {
    const baseX = gridX * SUB_TILES_PER_TILE;
    const baseY = gridY * SUB_TILES_PER_TILE;

    for (let dx = 0; dx < SUB_TILES_PER_TILE; dx++) {
      for (let dy = 0; dy < SUB_TILES_PER_TILE; dy++) {
        if (this.hasTreeAt(baseX + dx, baseY + dy)) return true;
      }
    }

    return false;
  }

  isMature(tree: Tree, now: number): boolean {
    return now - tree.plantedAt >= GROWTH_DURATION_MS;
  }

  plantTree(subX: number, subY: number, mature = false): Tree | null {
    if (this.hasTreeAt(subX, subY)) return null;

    const { x: px, y: py } = subTileCenterPx(subX, subY);

    const container = this.scene.add.container(px, py);
    const trunk = this.scene.add.rectangle(0, 5, 3, 7, 0x6d4c25);
    const leaves = this.scene.add.circle(0, -2, 7, 0x2e7d32);
    container.add([trunk, leaves]);
    container.setDepth(py);

    const tree: Tree = {
      subX,
      subY,
      plantedAt: mature ? -Infinity : this.scene.time.now,
      reservedBy: null,
      container,
    };

    if (mature) {
      container.setScale(1);
    } else {
      container.setScale(0.35);
      this.scene.tweens.add({
        targets: container,
        scale: 1,
        duration: GROWTH_DURATION_MS,
        ease: "Sine.easeOut",
      });
    }

    this.trees.set(this.key(subX, subY), tree);
    return tree;
  }

  removeTree(tree: Tree): void {
    tree.container.destroy();
    this.trees.delete(this.key(tree.subX, tree.subY));
  }

  /** Nearest mature, unreserved (or reserved by `worker`) tree within a pixel radius of a home point. */
  findNearestAvailableTree(
    homePx: { x: number; y: number },
    radiusPx: number,
    worker: Worker,
  ): Tree | null {
    const now = this.scene.time.now;
    let best: Tree | null = null;
    let bestDist = Infinity;

    for (const tree of this.trees.values()) {
      if (tree.reservedBy && tree.reservedBy !== worker) continue;
      if (!this.isMature(tree, now)) continue;

      const dx = tree.container.x - homePx.x;
      const dy = tree.container.y - homePx.y;
      if (Math.abs(dx) > radiusPx || Math.abs(dy) > radiusPx) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = tree;
      }
    }

    return best;
  }
}
