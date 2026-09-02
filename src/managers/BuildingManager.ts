import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";
import { WORKER_SETTINGS, BUILDING_UPGRADE_SETTINGS } from "../config/gameSettings";
import { BUILDING_LEVEL_TEXTURE_KEYS, type BuildingTypeConfig } from "../config/buildingTypes";
import { Worker } from "../entities/Worker";
import type { TreeManager } from "./TreeManager";
import type { DeerManager } from "./DeerManager";
import type { WolfManager } from "./WolfManager";
import type { ResourceManager } from "./ResourceManager";
import type { RiverManager } from "./RiverManager";
import {
  createForesterBehavior,
  createWoodcutterBehavior,
  createHuntsmanBehavior,
  type HuntsmanDeps,
} from "./WorkerBehaviors";

/** Where each worker slot idles at home, spread out so upgraded huts don't stack workers exactly on top of each other. */
const WORKER_HOME_OFFSETS: { x: number; y: number }[] = [
  { x: 0, y: 20 },
  { x: -14, y: 26 },
  { x: 14, y: 26 },
  { x: 0, y: 32 },
];

function workerHomeOffset(slotIndex: number): { x: number; y: number } {
  return WORKER_HOME_OFFSETS[slotIndex] ?? WORKER_HOME_OFFSETS[0];
}

export interface WorkerSlot {
  /** Null while a wolf-killed worker's replacement hasn't moved in yet. */
  worker: Worker | null;
  /** Counts down while worker is null; on reaching 0, a new worker is spawned. */
  respawnTimer: number;
}

export interface PlacedBuilding {
  gridX: number;
  gridY: number;
  type: BuildingTypeConfig;
  container: Phaser.GameObjects.Container;
  /** Draws the level bars above the roof/art; redrawn whenever level changes. */
  barsGraphics: Phaser.GameObjects.Graphics;
  /** The wall+roof shapes, or the level's cutout image — swapped out whole on every upgrade. */
  artObjects: Phaser.GameObjects.GameObject[];
  /** Local (container-space) y of the current art's top edge — where the level bars anchor. */
  artTopY: number;
  /** 0 = basic (no bars) up to BUILDING_UPGRADE_SETTINGS.maxLevel (full bars). */
  level: number;
  /** One slot per worker the building can house — length is level + 1. */
  slots: WorkerSlot[];
}

export class BuildingManager {
  private scene: Phaser.Scene;
  private buildings = new Map<string, PlacedBuilding>();
  private behaviors: Record<string, ReturnType<typeof createForesterBehavior>>;
  // Held by reference so WolfManager can be wired in after construction (it depends on
  // this BuildingManager, so the two can't both be ready at each other's constructor time).
  private huntsmanDeps: HuntsmanDeps;

  constructor(
    scene: Phaser.Scene,
    treeManager: TreeManager,
    resourceManager: ResourceManager,
    deerManager: DeerManager,
    riverManager: RiverManager,
  ) {
    this.scene = scene;
    this.huntsmanDeps = { deerManager, wolfManager: null, resourceManager, riverManager };
    this.behaviors = {
      forester: createForesterBehavior({ treeManager, buildingManager: this, riverManager }),
      woodcutter: createWoodcutterBehavior({ treeManager, resourceManager, riverManager }),
      hunter: createHuntsmanBehavior(this.huntsmanDeps),
    };
  }

  setWolfManager(wolfManager: WolfManager): void {
    this.huntsmanDeps.wolfManager = wolfManager;
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  isTileOccupied(gridX: number, gridY: number): boolean {
    return this.buildings.has(this.key(gridX, gridY));
  }

  /** Shared wall/roof measurements — also used to anchor the level bars above the roof. */
  private buildingGeometry() {
    const size = gridSettings.TILE_SIZE * 0.8;

    const wallHeight = size * 0.6;
    const wallCenterY = size * 0.15;
    const wallTopY = wallCenterY - wallHeight / 2;

    const roofWidth = size;
    const roofHeight = size * 0.45;
    // Sit the roof's base flush on the wall's top edge instead of centering it around
    // the same point as the wall (which buried half the roof inside the wall).
    const roofY = wallTopY - roofHeight / 2;

    return { size, wallHeight, wallCenterY, wallTopY, roofWidth, roofHeight, roofY };
  }

  /** Plain rectangle+triangle hut — the default look, and every building type but the
   * forester's upgrade levels. Returns the shapes plus the local y of the roof apex, so
   * the caller can anchor the level bars above it. */
  private createProceduralArt(type: BuildingTypeConfig): { objects: Phaser.GameObjects.GameObject[]; topY: number } {
    const { size, wallHeight, wallCenterY, roofWidth, roofHeight, roofY } = this.buildingGeometry();

    const base = this.scene.add.rectangle(0, wallCenterY, size, wallHeight, type.color);
    // Triangle's origin-centering offset is subtracted from these raw points directly,
    // so they must be given in a 0..width/0..height local frame, not pre-centered on zero.
    const roof = this.scene.add.triangle(
      0,
      roofY,
      0,
      roofHeight,
      roofWidth,
      roofHeight,
      roofWidth / 2,
      0,
      type.roofColor,
    );
    return { objects: [base, roof], topY: roofY - roofHeight / 2 };
  }

  /** Real cutout art for building types that have it — bigger and fancier at each upgrade level.
   * Scaled up a bit past the procedural huts' width since the cutout photos read as cluttered
   * and small on the grid otherwise. */
  private createTexturedArt(textureKey: string): { objects: Phaser.GameObjects.GameObject[]; topY: number } {
    const { size, wallHeight, wallCenterY } = this.buildingGeometry();
    // Same "ground line" the procedural wall sits on, so art and non-art huts line up.
    const groundY = wallCenterY + wallHeight / 2;

    const image = this.scene.add.image(0, groundY, textureKey).setOrigin(0.5, 1);
    image.setScale((size * 1.35) / image.width);
    return { objects: [image], topY: groundY - image.displayHeight };
  }

  private createArt(type: BuildingTypeConfig, level: number): { objects: Phaser.GameObjects.GameObject[]; topY: number } {
    const levelTextures = BUILDING_LEVEL_TEXTURE_KEYS[type.id];
    if (levelTextures) {
      // Level 0 (freshly placed, no bars yet) reuses the first texture — there's no
      // separate "level 0" art, so the fresh hut looks the same as after the first upgrade.
      const index = Math.min(Math.max(level, 1), levelTextures.length) - 1;
      return this.createTexturedArt(levelTextures[index]);
    }
    return this.createProceduralArt(type);
  }

  /** Destroys the building's current art and swaps in the art for its (new) level. */
  private refreshArt(building: PlacedBuilding): void {
    for (const obj of building.artObjects) obj.destroy();

    const { objects, topY } = this.createArt(building.type, building.level);
    // Insert below barsGraphics (always the container's last child) so the bars stay on top.
    building.container.addAt(objects, 0);
    building.artObjects = objects;
    building.artTopY = topY;
  }

  /** Clears and redraws the level-bar row above the art — empty when level is 0. */
  private redrawLevelBars(building: PlacedBuilding): void {
    const g = building.barsGraphics;
    g.clear();
    if (building.level <= 0) return;

    const barWidth = 10;
    const barHeight = 4;
    const gap = 3;
    const totalWidth = building.level * barWidth + (building.level - 1) * gap;
    const startX = -totalWidth / 2;
    const y = building.artTopY - barHeight - 6;

    for (let i = 0; i < building.level; i++) {
      const x = startX + i * (barWidth + gap);
      g.fillStyle(0xffd54a, 1);
      g.fillRect(x, y, barWidth, barHeight);
      g.lineStyle(1, 0x000000, 0.5);
      g.strokeRect(x, y, barWidth, barHeight);
    }
  }

  /** Spawns and appends a new worker slot — used both for a fresh building and each upgrade. */
  private addWorkerSlot(building: PlacedBuilding): void {
    const behavior = this.behaviors[building.type.id];
    const offset = workerHomeOffset(building.slots.length);
    const worker = new Worker(this.scene, building.gridX, building.gridY, building.type, behavior, offset);
    building.slots.push({ worker, respawnTimer: 0 });
  }

  placeBuilding(
    type: BuildingTypeConfig,
    gridX: number,
    gridY: number,
  ): PlacedBuilding | null {
    if (this.isTileOccupied(gridX, gridY)) return null;

    const px = gridX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;
    const py = gridY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;
    const container = this.scene.add.container(px, py);
    container.setDepth(py);

    const barsGraphics = this.scene.add.graphics();
    container.add(barsGraphics);

    const { objects, topY } = this.createArt(type, 0);
    container.addAt(objects, 0);

    const building: PlacedBuilding = {
      gridX,
      gridY,
      type,
      container,
      barsGraphics,
      artObjects: objects,
      artTopY: topY,
      level: 0,
      slots: [],
    };
    this.addWorkerSlot(building);
    this.buildings.set(this.key(gridX, gridY), building);
    return building;
  }

  getBuildingAt(gridX: number, gridY: number): PlacedBuilding | null {
    return this.buildings.get(this.key(gridX, gridY)) ?? null;
  }

  /** Wood cost to go from the current level to the next, or null if already at max level. */
  getUpgradeCost(building: PlacedBuilding): number | null {
    if (building.level >= BUILDING_UPGRADE_SETTINGS.maxLevel) return null;
    return (building.level + 1) * building.type.cost;
  }

  /** Adds one level (and one worker slot) to the building. Returns false if already at max level. */
  upgradeBuilding(building: PlacedBuilding): boolean {
    if (building.level >= BUILDING_UPGRADE_SETTINGS.maxLevel) return false;
    building.level++;
    this.addWorkerSlot(building);
    this.refreshArt(building);
    this.redrawLevelBars(building);
    return true;
  }

  removeBuildingAt(gridX: number, gridY: number): PlacedBuilding | null {
    const key = this.key(gridX, gridY);
    const building = this.buildings.get(key);
    if (!building) return null;

    for (const slot of building.slots) slot.worker?.destroy();
    building.container.destroy();
    this.buildings.delete(key);
    return building;
  }

  /** Advances every worker, and counts down the respawn timer for any slot left empty by a wolf. */
  updateWorkers(deltaMs: number): void {
    for (const building of this.buildings.values()) {
      for (let i = 0; i < building.slots.length; i++) {
        const slot = building.slots[i];
        if (slot.worker) {
          slot.worker.update(deltaMs);
          continue;
        }

        slot.respawnTimer -= deltaMs;
        if (slot.respawnTimer <= 0) {
          const behavior = this.behaviors[building.type.id];
          slot.worker = new Worker(
            this.scene,
            building.gridX,
            building.gridY,
            building.type,
            behavior,
            workerHomeOffset(i),
          );
        }
      }
    }
  }

  /** A wolf killed this worker — clears its slot and starts the respawn countdown. Returns whether it found (and killed) it. */
  killWorker(worker: Worker): boolean {
    for (const building of this.buildings.values()) {
      for (const slot of building.slots) {
        if (slot.worker === worker) {
          slot.worker.destroy();
          slot.worker = null;
          slot.respawnTimer = WORKER_SETTINGS.respawnDelayMs;
          return true;
        }
      }
    }
    return false;
  }

  /** True if this exact worker is still alive and employed (not already killed by another wolf). */
  hasWorker(worker: Worker): boolean {
    for (const building of this.buildings.values()) {
      for (const slot of building.slots) {
        if (slot.worker === worker) return true;
      }
    }
    return false;
  }

  /** All workers currently out and about — potential wolf prey. */
  getActiveWorkers(): Worker[] {
    const workers: Worker[] = [];
    for (const building of this.buildings.values()) {
      for (const slot of building.slots) {
        if (slot.worker) workers.push(slot.worker);
      }
    }
    return workers;
  }

  getBuildingCount(): number {
    return this.buildings.size;
  }
}
