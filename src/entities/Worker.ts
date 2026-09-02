import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";
import type { BuildingTypeConfig } from "../config/buildingTypes";

const WorkerState = {
  IDLE: "IDLE",
  MOVING_TO_TARGET: "MOVING_TO_TARGET",
  WORKING: "WORKING",
  RETURNING: "RETURNING",
} as const;
type WorkerState = (typeof WorkerState)[keyof typeof WorkerState];

export interface WorkTarget {
  tileX: number;
  tileY: number;
  payload?: unknown;
}

export interface WorkerBehavior {
  findTarget(worker: Worker): WorkTarget | null;
  onWorkComplete(worker: Worker, target: WorkTarget): void;
  /** Called when the worker is destroyed mid-task, so e.g. a reserved tree can be freed. */
  onCancel?(worker: Worker, target: WorkTarget): void;
}

const SPEED_PX_PER_SEC = 90;
const ARRIVE_THRESHOLD = 3;
const IDLE_RETRY_MS = 1000;

export class Worker {
  public readonly homeTile: { x: number; y: number };
  public readonly config: BuildingTypeConfig;
  public readonly container: Phaser.GameObjects.Container;

  private behavior: WorkerBehavior;
  private state: WorkerState = WorkerState.IDLE;
  private homePx: { x: number; y: number };
  private currentTarget: WorkTarget | null = null;
  private workTimer = 0;
  private idleTimer = 0;

  constructor(
    scene: Phaser.Scene,
    homeGridX: number,
    homeGridY: number,
    config: BuildingTypeConfig,
    behavior: WorkerBehavior,
  ) {
    this.homeTile = { x: homeGridX, y: homeGridY };
    this.config = config;
    this.behavior = behavior;

    this.homePx = {
      x: homeGridX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2,
      y: homeGridY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2 + 20,
    };

    this.container = scene.add.container(this.homePx.x, this.homePx.y);
    const body = scene.add.circle(0, 0, 8, config.workerColor);
    const outline = scene.add.circle(0, 0, 8).setStrokeStyle(1.5, 0x000000, 0.4);
    this.container.add([body, outline]);
    this.container.setDepth(this.homePx.y);
  }

  private tilePx(tileX: number, tileY: number): { x: number; y: number } {
    return {
      x: tileX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2,
      y: tileY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2,
    };
  }

  private moveToward(px: { x: number; y: number }, deltaMs: number): boolean {
    const dx = px.x - this.container.x;
    const dy = px.y - this.container.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= ARRIVE_THRESHOLD) {
      this.container.setPosition(px.x, px.y);
      return true;
    }

    const step = (SPEED_PX_PER_SEC * deltaMs) / 1000;
    const t = Math.min(1, step / dist);
    this.container.x += dx * t;
    this.container.y += dy * t;
    this.container.setDepth(this.container.y);
    return false;
  }

  update(deltaMs: number): void {
    switch (this.state) {
      case WorkerState.IDLE: {
        this.idleTimer -= deltaMs;
        if (this.idleTimer > 0) return;

        const target = this.behavior.findTarget(this);
        if (!target) {
          this.idleTimer = IDLE_RETRY_MS;
          return;
        }
        this.currentTarget = target;
        this.state = WorkerState.MOVING_TO_TARGET;
        break;
      }

      case WorkerState.MOVING_TO_TARGET: {
        if (!this.currentTarget) {
          this.state = WorkerState.IDLE;
          return;
        }
        const arrived = this.moveToward(
          this.tilePx(this.currentTarget.tileX, this.currentTarget.tileY),
          deltaMs,
        );
        if (arrived) {
          this.workTimer = this.config.workDurationMs;
          this.state = WorkerState.WORKING;
        }
        break;
      }

      case WorkerState.WORKING: {
        this.workTimer -= deltaMs;
        if (this.workTimer <= 0 && this.currentTarget) {
          this.behavior.onWorkComplete(this, this.currentTarget);
          this.currentTarget = null;
          this.state = WorkerState.RETURNING;
        }
        break;
      }

      case WorkerState.RETURNING: {
        const arrived = this.moveToward(this.homePx, deltaMs);
        if (arrived) {
          this.idleTimer = 0;
          this.state = WorkerState.IDLE;
        }
        break;
      }
    }
  }

  destroy(): void {
    if (this.currentTarget && this.behavior.onCancel) {
      this.behavior.onCancel(this, this.currentTarget);
    }
    this.container.destroy();
  }
}
