import * as Phaser from "phaser";
import { tileCenterPx } from "../scenes/gridSettings";
import type { Worker } from "../entities/Worker";

const SPAWN_INTERVAL_MIN_MS = 8000;
const SPAWN_INTERVAL_MAX_MS = 16000;
const MAX_DEER = 5;

export interface Deer {
  gridX: number;
  gridY: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
}

export class DeerManager {
  private scene: Phaser.Scene;
  private deer = new Map<string, Deer>();
  private spawnTimer: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.spawnTimer = Phaser.Math.Between(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  get count(): number {
    return this.deer.size;
  }

  hasDeerAt(gridX: number, gridY: number): boolean {
    return this.deer.has(this.key(gridX, gridY));
  }

  /** Ticks the spawn cooldown; returns true exactly when a spawn attempt should be made. */
  tickSpawnTimer(deltaMs: number): boolean {
    if (this.deer.size >= MAX_DEER) return false;

    this.spawnTimer -= deltaMs;
    if (this.spawnTimer > 0) return false;

    this.spawnTimer = Phaser.Math.Between(SPAWN_INTERVAL_MIN_MS, SPAWN_INTERVAL_MAX_MS);
    return true;
  }

  spawnDeer(gridX: number, gridY: number): Deer | null {
    if (this.hasDeerAt(gridX, gridY)) return null;

    const { x: px, y: py } = tileCenterPx(gridX, gridY);
    const container = this.scene.add.container(px, py);
    const body = this.scene.add.ellipse(0, 2, 18, 12, 0x9c6b45);
    const head = this.scene.add.circle(-10, -4, 6, 0x9c6b45);
    const earL = this.scene.add.ellipse(-13, -9, 3, 6, 0x9c6b45);
    const earR = this.scene.add.ellipse(-7, -9, 3, 6, 0x9c6b45);
    container.add([body, head, earL, earR]);
    container.setDepth(py);

    const deer: Deer = { gridX, gridY, reservedBy: null, container };
    this.deer.set(this.key(gridX, gridY), deer);
    return deer;
  }

  removeDeer(deer: Deer): void {
    deer.container.destroy();
    this.deer.delete(this.key(deer.gridX, deer.gridY));
  }

  /**
   * Nearest unreserved (or reserved by `worker`) deer within a pixel radius of a home point.
   * `isBlocked(px, py)`, if given, excludes deer the worker can't actually path to (e.g.
   * across an unbridged river) so a farther-but-reachable deer gets picked instead.
   */
  findNearestAvailableDeer(
    homePx: { x: number; y: number },
    radiusPx: number,
    worker: Worker,
    isBlocked?: (px: number, py: number) => boolean,
  ): Deer | null {
    let best: Deer | null = null;
    let bestDist = Infinity;

    for (const deer of this.deer.values()) {
      if (deer.reservedBy && deer.reservedBy !== worker) continue;

      const dx = deer.container.x - homePx.x;
      const dy = deer.container.y - homePx.y;
      if (Math.abs(dx) > radiusPx || Math.abs(dy) > radiusPx) continue;
      if (isBlocked && isBlocked(deer.container.x, deer.container.y)) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = deer;
      }
    }

    return best;
  }
}
