import * as Phaser from "phaser";
import { gridSettings, tileCenterPx } from "../scenes/gridSettings";
import { WOLF_SETTINGS } from "../config/gameSettings";
import type { Worker } from "../entities/Worker";
import type { RiverManager } from "./RiverManager";
import type { Deer } from "./DeerManager";
import type { DeerManager } from "./DeerManager";
import type { BuildingManager } from "./BuildingManager";

const WANDER_RADIUS_PX = gridSettings.TILE_SIZE * WOLF_SETTINGS.wanderRadiusTiles;

type AttackTarget = { kind: "deer"; deer: Deer } | { kind: "worker"; worker: Worker };

export interface Wolf {
  gridX: number;
  gridY: number;
  reservedBy: Worker | null;
  container: Phaser.GameObjects.Container;
  homePx: { x: number; y: number };
  wanderTarget: { x: number; y: number } | null;
  wanderTimer: number;
  attackTarget: AttackTarget | null;
  attackingTimer: number;
}

export class WolfManager {
  private scene: Phaser.Scene;
  private riverManager: RiverManager;
  private deerManager: DeerManager;
  private buildingManager: BuildingManager;
  private wolves = new Map<string, Wolf>();
  private spawnTimer: number;

  constructor(
    scene: Phaser.Scene,
    riverManager: RiverManager,
    deerManager: DeerManager,
    buildingManager: BuildingManager,
  ) {
    this.scene = scene;
    this.riverManager = riverManager;
    this.deerManager = deerManager;
    this.buildingManager = buildingManager;
    this.spawnTimer = Phaser.Math.Between(
      WOLF_SETTINGS.spawnIntervalMinMs,
      WOLF_SETTINGS.spawnIntervalMaxMs,
    );
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  get count(): number {
    return this.wolves.size;
  }

  hasWolfAt(gridX: number, gridY: number): boolean {
    return this.wolves.has(this.key(gridX, gridY));
  }

  /** True if this exact wolf is still alive (not already hunted down by someone else). */
  hasWolf(wolf: Wolf): boolean {
    return this.wolves.get(this.key(wolf.gridX, wolf.gridY)) === wolf;
  }

  /**
   * Wolves only sustain themselves on an abundant deer population: a cap that scales with
   * how many deer are around (so wolves stay much rarer than their prey), clamped to an
   * absolute ceiling.
   */
  private currentMaxWolves(): number {
    return Math.min(
      WOLF_SETTINGS.maxWolvesHardCap,
      Math.floor(this.deerManager.count / WOLF_SETTINGS.deerPerWolf),
    );
  }

  /** Ticks the spawn cooldown; returns true exactly when a spawn attempt should be made. */
  tickSpawnTimer(deltaMs: number): boolean {
    if (this.wolves.size >= this.currentMaxWolves()) return false;
    if (this.deerManager.count < WOLF_SETTINGS.minDeerCountToSpawn) return false;

    this.spawnTimer -= deltaMs;
    if (this.spawnTimer > 0) return false;

    this.spawnTimer = Phaser.Math.Between(
      WOLF_SETTINGS.spawnIntervalMinMs,
      WOLF_SETTINGS.spawnIntervalMaxMs,
    );
    return true;
  }

  spawnWolf(gridX: number, gridY: number): Wolf | null {
    if (this.hasWolfAt(gridX, gridY)) return null;

    const { x: px, y: py } = tileCenterPx(gridX, gridY);
    const container = this.scene.add.container(px, py);
    const tail = this.scene.add.ellipse(11, 3, 8, 4, 0x4a4a4a);
    const body = this.scene.add.ellipse(0, 2, 20, 10, 0x5c5c5c);
    const head = this.scene.add.circle(-11, -3, 6, 0x5c5c5c);
    const earL = this.scene.add.ellipse(-14, -10, 3, 6, 0x5c5c5c);
    const earR = this.scene.add.ellipse(-8, -10, 3, 6, 0x5c5c5c);
    container.add([tail, body, head, earL, earR]);
    container.setDepth(py);

    const wolf: Wolf = {
      gridX,
      gridY,
      reservedBy: null,
      container,
      homePx: { x: px, y: py },
      wanderTarget: null,
      wanderTimer: Phaser.Math.Between(
        WOLF_SETTINGS.wanderIdleMinMs,
        WOLF_SETTINGS.wanderIdleMaxMs,
      ),
      attackTarget: null,
      attackingTimer: 0,
    };
    this.wolves.set(this.key(gridX, gridY), wolf);
    return wolf;
  }

  removeWolf(wolf: Wolf): void {
    wolf.container.destroy();
    this.wolves.delete(this.key(wolf.gridX, wolf.gridY));
  }

  /** Ambles each unreserved wolf toward an occasional random nearby point — sometimes prey instead. */
  updateWander(deltaMs: number): void {
    for (const wolf of this.wolves.values()) {
      if (wolf.reservedBy) continue; // stands still once a hunter is stalking it

      if (wolf.attackingTimer > 0) {
        wolf.attackingTimer -= deltaMs;
        if (wolf.attackingTimer <= 0) {
          this.resolveAttack(wolf);
        }
        continue; // standing still, attacking
      }

      if (!wolf.wanderTarget) {
        wolf.wanderTimer -= deltaMs;
        if (wolf.wanderTimer <= 0) {
          const action = this.pickNextAction(wolf);
          if (action) {
            wolf.wanderTarget = action.target;
            wolf.attackTarget = action.attack ?? null;
          } else {
            // Boxed in by the river on every attempt — just try again next cycle.
            wolf.wanderTimer = Phaser.Math.Between(
              WOLF_SETTINGS.wanderIdleMinMs,
              WOLF_SETTINGS.wanderIdleMaxMs,
            );
          }
        }
        continue;
      }

      const dx = wolf.wanderTarget.x - wolf.container.x;
      const dy = wolf.wanderTarget.y - wolf.container.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= WOLF_SETTINGS.arriveThresholdPx) {
        wolf.container.setPosition(wolf.wanderTarget.x, wolf.wanderTarget.y);
        wolf.wanderTarget = null;

        if (wolf.attackTarget && this.isAttackTargetAlive(wolf.attackTarget)) {
          wolf.attackingTimer = WOLF_SETTINGS.attackDurationMs;
        } else {
          wolf.attackTarget = null;
          wolf.wanderTimer = Phaser.Math.Between(
            WOLF_SETTINGS.wanderIdleMinMs,
            WOLF_SETTINGS.wanderIdleMaxMs,
          );
        }
        continue;
      }

      const step = (WOLF_SETTINGS.wanderSpeedPxPerSec * deltaMs) / 1000;
      const t = Math.min(1, step / dist);
      wolf.container.x += dx * t;
      wolf.container.y += dy * t;
      wolf.container.setDepth(wolf.container.y);
    }
  }

  private isAttackTargetAlive(target: AttackTarget): boolean {
    return target.kind === "deer"
      ? this.deerManager.hasDeer(target.deer)
      : this.buildingManager.hasWorker(target.worker);
  }

  private resolveAttack(wolf: Wolf): void {
    const target = wolf.attackTarget;
    wolf.attackTarget = null;
    wolf.wanderTimer = Phaser.Math.Between(
      WOLF_SETTINGS.wanderIdleMinMs,
      WOLF_SETTINGS.wanderIdleMaxMs,
    );

    if (!target) return;

    if (target.kind === "deer") {
      if (this.deerManager.hasDeer(target.deer)) {
        this.deerManager.removeDeer(target.deer);
      }
    } else if (this.buildingManager.hasWorker(target.worker)) {
      this.buildingManager.killWorker(target.worker);
    }
  }

  private pickNextAction(
    wolf: Wolf,
  ): { target: { x: number; y: number }; attack?: AttackTarget } | null {
    if (Phaser.Math.Between(0, 99) < WOLF_SETTINGS.attackChancePercent) {
      const prey = this.findNearestPrey(wolf);
      if (prey) {
        const pos =
          prey.kind === "deer"
            ? { x: prey.deer.container.x, y: prey.deer.container.y }
            : { x: prey.worker.container.x, y: prey.worker.container.y };
        return { target: pos, attack: prey };
      }
    }

    const wanderPoint = this.pickWanderTarget(wolf);
    return wanderPoint ? { target: wanderPoint } : null;
  }

  /** A wolf with deer to hunt leaves people alone — it only turns on workers once no deer is within reach. */
  private findNearestPrey(wolf: Wolf): AttackTarget | null {
    const from = { x: wolf.container.x, y: wolf.container.y };
    const isBlocked = (px: number, py: number) =>
      this.riverManager.segmentCrossesRiver(from.x, from.y, px, py);

    const deer = this.deerManager.findNearestUnreservedDeer(from, WANDER_RADIUS_PX, isBlocked);
    if (deer) return { kind: "deer", deer };

    let nearestWorker: Worker | null = null;
    let bestWorkerDistSq = Infinity;
    for (const worker of this.buildingManager.getActiveWorkers()) {
      const dx = worker.container.x - from.x;
      const dy = worker.container.y - from.y;
      if (Math.abs(dx) > WANDER_RADIUS_PX || Math.abs(dy) > WANDER_RADIUS_PX) continue;
      if (isBlocked(worker.container.x, worker.container.y)) continue;

      const distSq = dx * dx + dy * dy;
      if (distSq < bestWorkerDistSq) {
        bestWorkerDistSq = distSq;
        nearestWorker = worker;
      }
    }

    return nearestWorker ? { kind: "worker", worker: nearestWorker } : null;
  }

  private pickWanderTarget(wolf: Wolf): { x: number; y: number } | null {
    const mapWidth = gridSettings.GRID_WIDTH * gridSettings.TILE_SIZE;
    const mapHeight = gridSettings.GRID_HEIGHT * gridSettings.TILE_SIZE;

    for (let attempt = 0; attempt < WOLF_SETTINGS.wanderTargetAttempts; attempt++) {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const radius = Phaser.Math.Between(gridSettings.TILE_SIZE, WANDER_RADIUS_PX);

      const target = {
        x: Phaser.Math.Clamp(
          wolf.homePx.x + Math.cos(angle) * radius,
          gridSettings.TILE_SIZE / 2,
          mapWidth - gridSettings.TILE_SIZE / 2,
        ),
        y: Phaser.Math.Clamp(
          wolf.homePx.y + Math.sin(angle) * radius,
          gridSettings.TILE_SIZE / 2,
          mapHeight - gridSettings.TILE_SIZE / 2,
        ),
      };

      if (
        !this.riverManager.segmentCrossesRiver(
          wolf.container.x,
          wolf.container.y,
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
   * Nearest unreserved (or reserved by `worker`) wolf within a pixel radius of a home point.
   * `isBlocked(px, py)`, if given, excludes wolves the hunter can't actually path to (e.g.
   * across an unbridged river) so a farther-but-reachable wolf gets picked instead.
   */
  findNearestAvailableWolf(
    homePx: { x: number; y: number },
    radiusPx: number,
    worker: Worker,
    isBlocked?: (px: number, py: number) => boolean,
  ): Wolf | null {
    let best: Wolf | null = null;
    let bestDist = Infinity;

    for (const wolf of this.wolves.values()) {
      if (wolf.reservedBy && wolf.reservedBy !== worker) continue;

      const dx = wolf.container.x - homePx.x;
      const dy = wolf.container.y - homePx.y;
      if (Math.abs(dx) > radiusPx || Math.abs(dy) > radiusPx) continue;
      if (isBlocked && isBlocked(wolf.container.x, wolf.container.y)) continue;

      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        best = wolf;
      }
    }

    return best;
  }
}
