import * as Phaser from "phaser";
import { SUB_TILES_PER_TILE, subTileCenterPx } from "../scenes/gridSettings";
import { TREE_SETTINGS } from "../config/gameSettings";
import type { Worker } from "../entities/Worker";

export type TreeState = "growing" | "mature" | "stump";

export interface Tree {
  subX: number;
  subY: number;
  state: TreeState;
  /** Counts down while state === "stump"; on reaching 0 the tree starts regrowing. */
  stumpTimer: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
  trunk: Phaser.GameObjects.Rectangle;
  leaves: Phaser.GameObjects.Arc;
  stump: Phaser.GameObjects.Rectangle;
}

export class TreeManager {
  private scene: Phaser.Scene;
  private trees = new Map<string, Tree>();
  private naturalGrowthTimer: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.naturalGrowthTimer = Phaser.Math.Between(
      TREE_SETTINGS.naturalGrowthMinMs,
      TREE_SETTINGS.naturalGrowthMaxMs,
    );
  }

  /** Ticks the natural-regrowth cooldown; returns true exactly when a sapling should try to sprout. */
  tickNaturalGrowthTimer(deltaMs: number): boolean {
    this.naturalGrowthTimer -= deltaMs;
    if (this.naturalGrowthTimer > 0) return false;

    this.naturalGrowthTimer = Phaser.Math.Between(
      TREE_SETTINGS.naturalGrowthMinMs,
      TREE_SETTINGS.naturalGrowthMaxMs,
    );
    return true;
  }

  /** Counts down every stump's timer; once it expires, the stump starts sprouting again. */
  updateStumpRegrowth(deltaMs: number): void {
    for (const tree of this.trees.values()) {
      if (tree.state !== "stump") continue;

      tree.stumpTimer -= deltaMs;
      if (tree.stumpTimer <= 0) {
        this.beginGrowing(tree);
      }
    }
  }

  private key(subX: number, subY: number): string {
    return `${subX},${subY}`;
  }

  hasTreeAt(subX: number, subY: number): boolean {
    return this.trees.has(this.key(subX, subY));
  }

  getTreeAt(subX: number, subY: number): Tree | undefined {
    return this.trees.get(this.key(subX, subY));
  }

  /** True if any of the (SUB_TILES_PER_TILE)^2 slots inside a building tile holds a growing
   * or mature tree — a bare stump doesn't block building, per hasAnyTreeInBuildingTile's callers. */
  hasAnyTreeInBuildingTile(gridX: number, gridY: number): boolean {
    const baseX = gridX * SUB_TILES_PER_TILE;
    const baseY = gridY * SUB_TILES_PER_TILE;

    for (let dx = 0; dx < SUB_TILES_PER_TILE; dx++) {
      for (let dy = 0; dy < SUB_TILES_PER_TILE; dy++) {
        const tree = this.getTreeAt(baseX + dx, baseY + dy);
        if (tree && tree.state !== "stump") return true;
      }
    }

    return false;
  }

  /** Destroys any stumps under a building tile — called once a building is actually placed there. */
  clearStumpsInBuildingTile(gridX: number, gridY: number): void {
    const baseX = gridX * SUB_TILES_PER_TILE;
    const baseY = gridY * SUB_TILES_PER_TILE;

    for (let dx = 0; dx < SUB_TILES_PER_TILE; dx++) {
      for (let dy = 0; dy < SUB_TILES_PER_TILE; dy++) {
        const tree = this.getTreeAt(baseX + dx, baseY + dy);
        if (tree && tree.state === "stump") {
          this.removeTree(tree);
        }
      }
    }
  }

  isMature(tree: Tree): boolean {
    return tree.state === "mature";
  }

  plantTree(subX: number, subY: number, mature = false): Tree | null {
    if (this.hasTreeAt(subX, subY)) return null;

    const { x: px, y: py } = subTileCenterPx(subX, subY);

    const container = this.scene.add.container(px, py);
    const stump = this.scene.add.rectangle(0, 6, 6, 4, 0x6d4c25).setVisible(false);
    const trunk = this.scene.add.rectangle(0, 5, 3, 7, 0x6d4c25);
    const leaves = this.scene.add.circle(0, -2, 7, 0x2e7d32);
    container.add([stump, trunk, leaves]);
    container.setDepth(py);

    const tree: Tree = {
      subX,
      subY,
      state: "growing",
      stumpTimer: 0,
      reservedBy: null,
      container,
      trunk,
      leaves,
      stump,
    };

    if (mature) {
      tree.state = "mature";
      container.setScale(1);
    } else {
      this.beginGrowing(tree);
    }

    this.trees.set(this.key(subX, subY), tree);
    return tree;
  }

  /** Cuts down or grazes a mature tree — it becomes a buildable stump rather than vanishing outright. */
  convertToStump(tree: Tree): void {
    tree.state = "stump";
    tree.stumpTimer = TREE_SETTINGS.stumpDurationMs;
    tree.reservedBy = null;
    tree.stump.setVisible(true);
    tree.trunk.setVisible(false);
    tree.leaves.setVisible(false);
    tree.container.setScale(1);
  }

  private beginGrowing(tree: Tree): void {
    tree.state = "growing";
    tree.stump.setVisible(false);
    tree.trunk.setVisible(true);
    tree.leaves.setVisible(true);
    tree.container.setScale(0.35);

    this.scene.tweens.add({
      targets: tree.container,
      scale: 1,
      duration: TREE_SETTINGS.growthDurationMs,
      ease: "Sine.easeOut",
      onComplete: () => {
        tree.state = "mature";
      },
    });
  }

  /** Fully destroys a tree entity — used to clear a stump once a building takes its tile. */
  removeTree(tree: Tree): void {
    tree.container.destroy();
    this.trees.delete(this.key(tree.subX, tree.subY));
  }

  /**
   * Nearest mature, unreserved (or reserved by `worker`) tree within a pixel radius of a home
   * point. `isBlocked(px, py)`, if given, excludes trees the worker can't actually path to
   * (e.g. across an unbridged river) so a farther-but-reachable tree gets picked instead.
   */
  findNearestAvailableTree(
    homePx: { x: number; y: number },
    radiusPx: number,
    worker: Worker,
    isBlocked?: (px: number, py: number) => boolean,
  ): Tree | null {
    let best: Tree | null = null;
    let bestDist = Infinity;

    for (const tree of this.trees.values()) {
      if (tree.reservedBy && tree.reservedBy !== worker) continue;
      if (!this.isMature(tree)) continue;

      const dx = tree.container.x - homePx.x;
      const dy = tree.container.y - homePx.y;
      if (Math.abs(dx) > radiusPx || Math.abs(dy) > radiusPx) continue;
      if (isBlocked && isBlocked(tree.container.x, tree.container.y)) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = tree;
      }
    }

    return best;
  }

  /**
   * Nearest mature tree within a pixel radius of a point, ignoring the woodcutter
   * reservation system entirely — used by grazing deer, who don't compete for a
   * worker's claimed tree so much as just eat whatever's close by.
   */
  findNearestMatureTree(
    fromPx: { x: number; y: number },
    radiusPx: number,
    isBlocked?: (px: number, py: number) => boolean,
  ): Tree | null {
    let best: Tree | null = null;
    let bestDist = Infinity;

    for (const tree of this.trees.values()) {
      if (!this.isMature(tree)) continue;

      const dx = tree.container.x - fromPx.x;
      const dy = tree.container.y - fromPx.y;
      if (Math.abs(dx) > radiusPx || Math.abs(dy) > radiusPx) continue;
      if (isBlocked && isBlocked(tree.container.x, tree.container.y)) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = tree;
      }
    }

    return best;
  }
}
