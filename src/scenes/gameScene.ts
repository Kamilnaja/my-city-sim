import * as Phaser from "phaser";
import { gridSettings } from "./gridSettings";
import { GridManager } from "../managers/GridManager";
import { TreeManager } from "../managers/TreeManager";
import { BuildingManager } from "../managers/BuildingManager";
import { ResourceManager } from "../managers/ResourceManager";
import type { BuildingTypeConfig } from "../config/buildingTypes";

const STARTING_WOOD = 20;
const INITIAL_TREE_COUNT = 45;
const DEMOLISH_REFUND_RATIO = 0.3;

export class GameScene extends Phaser.Scene {
  private gridManager!: GridManager;
  private treeManager!: TreeManager;
  private buildingManager!: BuildingManager;
  private resourceManager!: ResourceManager;
  private placementType: BuildingTypeConfig | null = null;

  constructor() {
    super("GameScene");
  }

  preload() {
    // Wszystkie elementy są rysowane proceduralnie – bez zewnętrznych grafik.
  }

  create() {
    const mapWidth = gridSettings.GRID_WIDTH * gridSettings.TILE_SIZE;
    const mapHeight = gridSettings.GRID_HEIGHT * gridSettings.TILE_SIZE;

    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBackgroundColor(0x1b2e1b);

    this.add.rectangle(0, 0, mapWidth, mapHeight, 0x3a6b35).setOrigin(0, 0).setDepth(-1000);

    this.gridManager = new GridManager(this);
    this.gridManager.createGrid();

    this.resourceManager = new ResourceManager(STARTING_WOOD);
    this.treeManager = new TreeManager(this);
    this.buildingManager = new BuildingManager(this, this.treeManager, this.resourceManager);

    this.spawnInitialForest();

    this.game.registry.set("resourceManager", this.resourceManager);

    this.scene.launch("UIScene");

    this.game.events.on("selectBuildingType", (type: BuildingTypeConfig) => {
      this.placementType = type;
      this.gridManager.setPlacementValidator((x, y) => this.canPlaceAt(type, x, y));
    });

    this.game.events.on("cancelPlacement", () => this.exitPlacementMode());

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
        return;
      }
      this.handleLeftClick(pointer);
    });

    this.input.keyboard?.on("keydown-ESC", () => this.exitPlacementMode());
  }

  update(_time: number, delta: number) {
    this.buildingManager.updateWorkers(delta);
  }

  private spawnInitialForest(): void {
    let planted = 0;
    let attempts = 0;

    while (planted < INITIAL_TREE_COUNT && attempts < INITIAL_TREE_COUNT * 20) {
      attempts++;
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.treeManager.hasTreeAt(x, y)) continue;

      const tree = this.treeManager.plantTree(x, y, /* mature */ true);
      if (tree) planted++;
    }
  }

  private canPlaceAt(type: BuildingTypeConfig, gridX: number, gridY: number): boolean {
    if (this.buildingManager.isTileOccupied(gridX, gridY)) return false;
    if (this.treeManager.hasTreeAt(gridX, gridY)) return false;
    if (!this.resourceManager.canAfford(type.cost)) return false;
    return true;
  }

  private tileFromPointer(pointer: Phaser.Input.Pointer): { x: number; y: number } | null {
    const gridX = Math.floor(pointer.worldX / gridSettings.TILE_SIZE);
    const gridY = Math.floor(pointer.worldY / gridSettings.TILE_SIZE);

    if (
      gridX < 0 ||
      gridY < 0 ||
      gridX >= gridSettings.GRID_WIDTH ||
      gridY >= gridSettings.GRID_HEIGHT
    ) {
      return null;
    }

    return { x: gridX, y: gridY };
  }

  private handleLeftClick(pointer: Phaser.Input.Pointer): void {
    if (!this.placementType) return;

    const tile = this.tileFromPointer(pointer);
    if (!tile) return;

    if (!this.canPlaceAt(this.placementType, tile.x, tile.y)) return;

    this.resourceManager.spend(this.placementType.cost);
    this.buildingManager.placeBuilding(this.placementType, tile.x, tile.y);

    this.game.events.emit("buildingPlaced");
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    this.exitPlacementMode();

    const tile = this.tileFromPointer(pointer);
    if (!tile) return;

    const removed = this.buildingManager.removeBuildingAt(tile.x, tile.y);
    if (!removed) return;

    const refund = Math.round(removed.type.cost * DEMOLISH_REFUND_RATIO);
    if (refund > 0) this.resourceManager.addWood(refund);

    this.game.events.emit("buildingRemoved", removed.type, refund);
  }

  private exitPlacementMode(): void {
    this.placementType = null;
    this.gridManager.setPlacementValidator(null);
    this.game.events.emit("placementCancelled");
  }
}
