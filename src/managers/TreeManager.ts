import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";
import type { Worker } from "../entities/Worker";

const GROWTH_DURATION_MS = 6000;

export interface Tree {
  gridX: number;
  gridY: number;
  plantedAt: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
  leaves: Phaser.GameObjects.Arc;
}

export class TreeManager {
  private scene: Phaser.Scene;
  private trees = new Map<string, Tree>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  hasTreeAt(gridX: number, gridY: number): boolean {
    return this.trees.has(this.key(gridX, gridY));
  }

  isMature(tree: Tree, now: number): boolean {
    return now - tree.plantedAt >= GROWTH_DURATION_MS;
  }

  plantTree(gridX: number, gridY: number, mature = false): Tree | null {
    if (this.hasTreeAt(gridX, gridY)) return null;

    const px = gridX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;
    const py = gridY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;

    const container = this.scene.add.container(px, py);
    const trunk = this.scene.add.rectangle(0, 10, 6, 14, 0x6d4c25);
    const leaves = this.scene.add.circle(0, -4, 14, 0x2e7d32);
    container.add([trunk, leaves]);
    container.setDepth(py);

    const tree: Tree = {
      gridX,
      gridY,
      plantedAt: mature ? -Infinity : this.scene.time.now,
      reservedBy: null,
      container,
      leaves,
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

    this.trees.set(this.key(gridX, gridY), tree);
    return tree;
  }

  removeTree(tree: Tree): void {
    tree.container.destroy();
    this.trees.delete(this.key(tree.gridX, tree.gridY));
  }

  /** Nearest mature, unreserved (or reserved by `worker`) tree within radius of a home tile. */
  findNearestAvailableTree(
    homeX: number,
    homeY: number,
    radiusTiles: number,
    worker: Worker,
  ): Tree | null {
    const now = this.scene.time.now;
    let best: Tree | null = null;
    let bestDist = Infinity;

    for (const tree of this.trees.values()) {
      if (tree.reservedBy && tree.reservedBy !== worker) continue;
      if (!this.isMature(tree, now)) continue;

      const dx = tree.gridX - homeX;
      const dy = tree.gridY - homeY;
      if (Math.abs(dx) > radiusTiles || Math.abs(dy) > radiusTiles) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = tree;
      }
    }

    return best;
  }
}
