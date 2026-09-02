import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";
import type { BuildingTypeConfig } from "../config/buildingTypes";
import { Worker } from "../entities/Worker";
import type { TreeManager } from "./TreeManager";
import type { ResourceManager } from "./ResourceManager";
import { createForesterBehavior, createWoodcutterBehavior } from "./WorkerBehaviors";

export interface PlacedBuilding {
  gridX: number;
  gridY: number;
  type: BuildingTypeConfig;
  container: Phaser.GameObjects.Container;
  worker: Worker;
}

export class BuildingManager {
  private scene: Phaser.Scene;
  private buildings = new Map<string, PlacedBuilding>();
  private behaviors: Record<string, ReturnType<typeof createForesterBehavior>>;

  constructor(
    scene: Phaser.Scene,
    treeManager: TreeManager,
    resourceManager: ResourceManager,
  ) {
    this.scene = scene;
    this.behaviors = {
      forester: createForesterBehavior({ treeManager, buildingManager: this }),
      woodcutter: createWoodcutterBehavior({ treeManager, resourceManager }),
    };
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  isTileOccupied(gridX: number, gridY: number): boolean {
    return this.buildings.has(this.key(gridX, gridY));
  }

  private createSprite(
    gridX: number,
    gridY: number,
    type: BuildingTypeConfig,
  ): Phaser.GameObjects.Container {
    const px = gridX * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;
    const py = gridY * gridSettings.TILE_SIZE + gridSettings.TILE_SIZE / 2;
    const size = gridSettings.TILE_SIZE * 0.8;

    const wallHeight = size * 0.6;
    const wallCenterY = size * 0.15;
    const wallTopY = wallCenterY - wallHeight / 2;

    const roofWidth = size;
    const roofHeight = size * 0.45;
    // Sit the roof's base flush on the wall's top edge instead of centering it around
    // the same point as the wall (which buried half the roof inside the wall).
    const roofY = wallTopY - roofHeight / 2;

    const container = this.scene.add.container(px, py);
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
    container.add([base, roof]);
    container.setDepth(py);
    return container;
  }

  placeBuilding(
    type: BuildingTypeConfig,
    gridX: number,
    gridY: number,
  ): PlacedBuilding | null {
    if (this.isTileOccupied(gridX, gridY)) return null;

    const behavior = this.behaviors[type.id];
    const container = this.createSprite(gridX, gridY, type);
    const worker = new Worker(this.scene, gridX, gridY, type, behavior);

    const building: PlacedBuilding = { gridX, gridY, type, container, worker };
    this.buildings.set(this.key(gridX, gridY), building);
    return building;
  }

  removeBuildingAt(gridX: number, gridY: number): PlacedBuilding | null {
    const key = this.key(gridX, gridY);
    const building = this.buildings.get(key);
    if (!building) return null;

    building.worker.destroy();
    building.container.destroy();
    this.buildings.delete(key);
    return building;
  }

  updateWorkers(deltaMs: number): void {
    for (const building of this.buildings.values()) {
      building.worker.update(deltaMs);
    }
  }

  getBuildingCount(): number {
    return this.buildings.size;
  }
}
