import * as Phaser from "phaser";
import {
  gridSettings,
  SUB_TILES_PER_TILE,
  TREE_GRID_WIDTH,
  TREE_GRID_HEIGHT,
} from "./gridSettings";
import { GridManager } from "../managers/GridManager";
import { TreeManager } from "../managers/TreeManager";
import { DeerManager } from "../managers/DeerManager";
import { RiverManager } from "../managers/RiverManager";
import { BuildingManager } from "../managers/BuildingManager";
import { ResourceManager } from "../managers/ResourceManager";
import { BRIDGE_TOOL, isBridgeTool, type PlacementTool } from "../config/buildingTypes";

const STARTING_WOOD = 20;
// Trees live on a 2x2-per-tile sub-grid, so scale the count up to keep the same forest density.
const INITIAL_TREE_COUNT = 180;
const DEMOLISH_REFUND_RATIO = 0.3;
const DEER_SPAWN_ATTEMPTS = 20;

export class GameScene extends Phaser.Scene {
  private gridManager!: GridManager;
  private treeManager!: TreeManager;
  private deerManager!: DeerManager;
  private riverManager!: RiverManager;
  private buildingManager!: BuildingManager;
  private resourceManager!: ResourceManager;
  private placementType: PlacementTool | null = null;

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

    this.resourceManager = new ResourceManager({ wood: STARTING_WOOD });
    this.treeManager = new TreeManager(this);
    this.deerManager = new DeerManager(this);
    this.riverManager = new RiverManager(this);
    this.riverManager.generateRiver();
    this.buildingManager = new BuildingManager(
      this,
      this.treeManager,
      this.resourceManager,
      this.deerManager,
      this.riverManager,
    );

    this.spawnInitialForest();

    this.game.registry.set("resourceManager", this.resourceManager);

    this.scene.launch("UIScene");

    this.game.events.on("selectBuildingType", (tool: PlacementTool) => {
      this.placementType = tool;
      this.gridManager.setPlacementValidator((x, y) => this.canPlaceAt(tool, x, y));
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

    if (this.deerManager.tickSpawnTimer(delta)) {
      this.trySpawnDeer();
    }
  }

  private trySpawnDeer(): void {
    // Prefer a forested tile first (thematically, deer live in the woods)...
    for (let attempt = 0; attempt < DEER_SPAWN_ATTEMPTS; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.deerManager.hasDeerAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;
      if (!this.treeManager.hasAnyTreeInBuildingTile(x, y)) continue;

      if (this.deerManager.spawnDeer(x, y)) return;
    }

    // ...but fall back to any free tile so spawning doesn't stall in a sparse forest.
    for (let attempt = 0; attempt < DEER_SPAWN_ATTEMPTS; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.deerManager.hasDeerAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;

      if (this.deerManager.spawnDeer(x, y)) return;
    }
  }

  private spawnInitialForest(): void {
    let planted = 0;
    let attempts = 0;

    while (planted < INITIAL_TREE_COUNT && attempts < INITIAL_TREE_COUNT * 20) {
      attempts++;
      const x = Phaser.Math.Between(0, TREE_GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, TREE_GRID_HEIGHT - 1);

      if (this.treeManager.hasTreeAt(x, y)) continue;

      const parentGridX = Math.floor(x / SUB_TILES_PER_TILE);
      const parentGridY = Math.floor(y / SUB_TILES_PER_TILE);
      if (this.riverManager.isRiver(parentGridX, parentGridY)) continue;

      const tree = this.treeManager.plantTree(x, y, /* mature */ true);
      if (tree) planted++;
    }
  }

  private canPlaceAt(tool: PlacementTool, gridX: number, gridY: number): boolean {
    if (isBridgeTool(tool)) {
      if (!this.riverManager.isRiver(gridX, gridY)) return false;
      if (this.riverManager.hasBridge(gridX, gridY)) return false;
      if (!this.resourceManager.canAfford("wood", tool.cost)) return false;
      return true;
    }

    if (this.buildingManager.isTileOccupied(gridX, gridY)) return false;
    if (this.treeManager.hasAnyTreeInBuildingTile(gridX, gridY)) return false;
    if (this.riverManager.isRiver(gridX, gridY)) return false;
    if (!this.resourceManager.canAfford("wood", tool.cost)) return false;
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

    this.resourceManager.spend("wood", this.placementType.cost);

    if (isBridgeTool(this.placementType)) {
      this.riverManager.buildBridge(tile.x, tile.y);
    } else {
      this.buildingManager.placeBuilding(this.placementType, tile.x, tile.y);
    }

    this.game.events.emit("buildingPlaced");
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    this.exitPlacementMode();

    const tile = this.tileFromPointer(pointer);
    if (!tile) return;

    const removed = this.buildingManager.removeBuildingAt(tile.x, tile.y);
    if (removed) {
      const refund = Math.round(removed.type.cost * DEMOLISH_REFUND_RATIO);
      if (refund > 0) this.resourceManager.add("wood", refund);
      this.game.events.emit("buildingRemoved", removed.type, refund);
      return;
    }

    if (this.riverManager.removeBridge(tile.x, tile.y)) {
      const refund = Math.round(BRIDGE_TOOL.cost * DEMOLISH_REFUND_RATIO);
      if (refund > 0) this.resourceManager.add("wood", refund);
      this.game.events.emit("buildingRemoved", BRIDGE_TOOL, refund);
    }
  }

  private exitPlacementMode(): void {
    this.placementType = null;
    this.gridManager.setPlacementValidator(null);
    this.game.events.emit("placementCancelled");
  }
}
