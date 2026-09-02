import * as Phaser from "phaser";
import { gridSettings, tileCenterPx } from "../scenes/gridSettings";
import { DEER_SETTINGS } from "../config/gameSettings";
import type { Worker } from "../entities/Worker";
import type { RiverManager } from "./RiverManager";
import type { Tree } from "./TreeManager";
import type { TreeManager } from "./TreeManager";

const WANDER_RADIUS_PX = gridSettings.TILE_SIZE * DEER_SETTINGS.wanderRadiusTiles;

export interface Deer {
  gridX: number;
  gridY: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
  homePx: { x: number; y: number };
  wanderTarget: { x: number; y: number } | null;
  wanderTimer: number;
  /** Set when the current wanderTarget is a tree the deer means to graze on arrival. */
  eatTarget: Tree | null;
  /** >0 while the deer stands at a tree eating it, before it actually disappears. */
  eatingTimer: number;
}

export class DeerManager {
  private scene: Phaser.Scene;
  private riverManager: RiverManager;
  private treeManager: TreeManager;
  private deer = new Map<string, Deer>();
  private spawnTimer: number;

  constructor(scene: Phaser.Scene, riverManager: RiverManager, treeManager: TreeManager) {
    this.scene = scene;
    this.riverManager = riverManager;
    this.treeManager = treeManager;
    this.spawnTimer = Phaser.Math.Between(
      DEER_SETTINGS.spawnIntervalMinMs,
      DEER_SETTINGS.spawnIntervalMaxMs,
    );
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
    if (this.deer.size >= DEER_SETTINGS.maxDeer) return false;

    this.spawnTimer -= deltaMs;
    if (this.spawnTimer > 0) return false;

    this.spawnTimer = Phaser.Math.Between(
      DEER_SETTINGS.spawnIntervalMinMs,
      DEER_SETTINGS.spawnIntervalMaxMs,
    );
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

    const deer: Deer = {
      gridX,
      gridY,
      reservedBy: null,
      container,
      homePx: { x: px, y: py },
      wanderTarget: null,
      wanderTimer: Phaser.Math.Between(
        DEER_SETTINGS.wanderIdleMinMs,
        DEER_SETTINGS.wanderIdleMaxMs,
      ),
      eatTarget: null,
      eatingTimer: 0,
    };
    this.deer.set(this.key(gridX, gridY), deer);
    return deer;
  }

  removeDeer(deer: Deer): void {
    deer.container.destroy();
    this.deer.delete(this.key(deer.gridX, deer.gridY));
  }

  /** True if this exact deer is still alive (not already eaten/hunted, possibly by someone else). */
  hasDeer(deer: Deer): boolean {
    return this.deer.get(this.key(deer.gridX, deer.gridY)) === deer;
  }

  /** Ambles each unreserved deer toward an occasional random nearby point — sometimes a tree to graze on. */
  updateWander(deltaMs: number): void {
    for (const deer of this.deer.values()) {
      if (deer.reservedBy) continue; // stands still once a hunter is stalking it

      if (deer.eatingTimer > 0) {
        deer.eatingTimer -= deltaMs;
        if (deer.eatingTimer <= 0) {
          const tree = deer.eatTarget;
          deer.eatTarget = null;
          if (tree && this.treeManager.hasTreeAt(tree.subX, tree.subY) && this.treeManager.isMature(tree)) {
            this.treeManager.convertToStump(tree);
          }
          deer.wanderTimer = Phaser.Math.Between(
            DEER_SETTINGS.wanderIdleMinMs,
            DEER_SETTINGS.wanderIdleMaxMs,
          );
        }
        continue; // standing still, chewing
      }

      if (!deer.wanderTarget) {
        deer.wanderTimer -= deltaMs;
        if (deer.wanderTimer <= 0) {
          const action = this.pickNextAction(deer);
          if (action) {
            deer.wanderTarget = action.target;
            deer.eatTarget = action.tree ?? null;
          } else {
            // Boxed in by the river on every attempt — just try again next cycle.
            deer.wanderTimer = Phaser.Math.Between(
              DEER_SETTINGS.wanderIdleMinMs,
              DEER_SETTINGS.wanderIdleMaxMs,
            );
          }
        }
        continue;
      }

      const dx = deer.wanderTarget.x - deer.container.x;
      const dy = deer.wanderTarget.y - deer.container.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= DEER_SETTINGS.arriveThresholdPx) {
        deer.container.setPosition(deer.wanderTarget.x, deer.wanderTarget.y);
        deer.wanderTarget = null;

        if (deer.eatTarget) {
          // Tree may have been chopped or eaten by another deer while en route.
          if (
            this.treeManager.hasTreeAt(deer.eatTarget.subX, deer.eatTarget.subY) &&
            this.treeManager.isMature(deer.eatTarget)
          ) {
            deer.eatingTimer = DEER_SETTINGS.eatDurationMs;
          } else {
            deer.eatTarget = null;
            deer.wanderTimer = Phaser.Math.Between(
              DEER_SETTINGS.wanderIdleMinMs,
              DEER_SETTINGS.wanderIdleMaxMs,
            );
          }
        } else {
          deer.wanderTimer = Phaser.Math.Between(
            DEER_SETTINGS.wanderIdleMinMs,
            DEER_SETTINGS.wanderIdleMaxMs,
          );
        }
        continue;
      }

      const step = (DEER_SETTINGS.wanderSpeedPxPerSec * deltaMs) / 1000;
      const t = Math.min(1, step / dist);
      deer.container.x += dx * t;
      deer.container.y += dy * t;
      deer.container.setDepth(deer.container.y);
    }
  }

  private pickNextAction(
    deer: Deer,
  ): { target: { x: number; y: number }; tree?: Tree } | null {
    if (Phaser.Math.Between(0, 99) < DEER_SETTINGS.eatTreeChancePercent) {
      const tree = this.treeManager.findNearestMatureTree(
        { x: deer.container.x, y: deer.container.y },
        WANDER_RADIUS_PX,
        (px, py) => this.riverManager.segmentCrossesRiver(deer.container.x, deer.container.y, px, py),
      );
      if (tree) {
        return { target: { x: tree.container.x, y: tree.container.y }, tree };
      }
    }

    const wanderPoint = this.pickWanderTarget(deer);
    return wanderPoint ? { target: wanderPoint } : null;
  }

  private pickWanderTarget(deer: Deer): { x: number; y: number } | null {
    const mapWidth = gridSettings.GRID_WIDTH * gridSettings.TILE_SIZE;
    const mapHeight = gridSettings.GRID_HEIGHT * gridSettings.TILE_SIZE;

    for (let attempt = 0; attempt < DEER_SETTINGS.wanderTargetAttempts; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Phaser.Math.Between(gridSettings.TILE_SIZE, WANDER_RADIUS_PX);

      const target = {
        x: Phaser.Math.Clamp(
          deer.homePx.x + Math.cos(angle) * radius,
          gridSettings.TILE_SIZE / 2,
          mapWidth - gridSettings.TILE_SIZE / 2,
        ),
        y: Phaser.Math.Clamp(
          deer.homePx.y + Math.sin(angle) * radius,
          gridSettings.TILE_SIZE / 2,
          mapHeight - gridSettings.TILE_SIZE / 2,
        ),
      };

      if (
        !this.riverManager.segmentCrossesRiver(
          deer.container.x,
          deer.container.y,
          target.x,
          target.y,
        )
      ) {
        return target;
      }
    }

    return null;
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

  /**
   * Nearest deer with no hunter currently after it, within a pixel radius of a point.
   * Used by wolves — they aren't Workers, so they don't participate in the hunter
   * reservation system, they just leave a hunter's already-claimed deer alone.
   */
  findNearestUnreservedDeer(
    fromPx: { x: number; y: number },
    radiusPx: number,
    isBlocked?: (px: number, py: number) => boolean,
  ): Deer | null {
    let best: Deer | null = null;
    let bestDist = Infinity;

    for (const deer of this.deer.values()) {
      if (deer.reservedBy) continue;

      const dx = deer.container.x - fromPx.x;
      const dy = deer.container.y - fromPx.y;
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
