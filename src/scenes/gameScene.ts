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
import { WolfManager } from "../managers/WolfManager";
import { RiverManager } from "../managers/RiverManager";
import { BuildingManager, type PlacedBuilding } from "../managers/BuildingManager";
import { ResourceManager } from "../managers/ResourceManager";
import {
  BRIDGE_TOOL,
  isBridgeTool,
  BUILDING_TYPES,
  BUILDING_LEVEL_TEXTURE_KEYS,
  type PlacementTool,
} from "../config/buildingTypes";
import { prepareCutoutTexture } from "../utils/imageProcessing";
import lesnik1Url from "../assets/lesnik_1.jpg";
import lesnik2Url from "../assets/lesnik_2.jpg";
import lesnik3Url from "../assets/lesnik_3.jpg";
import drwal1Url from "../assets/drwal_1.jpg";
import drwal2Url from "../assets/drwal_2.jpg";
import drwal3Url from "../assets/drwal_3.jpg";
import {
  RESOURCE_SETTINGS,
  TREE_SETTINGS,
  DEER_SETTINGS,
  WOLF_SETTINGS,
  BUILDING_UPGRADE_SETTINGS,
} from "../config/gameSettings";

export class GameScene extends Phaser.Scene {
  private gridManager!: GridManager;
  private treeManager!: TreeManager;
  private deerManager!: DeerManager;
  private wolfManager!: WolfManager;
  private riverManager!: RiverManager;
  private buildingManager!: BuildingManager;
  private resourceManager!: ResourceManager;
  private placementType: PlacementTool | null = null;
  private selectedBuilding: PlacedBuilding | null = null;
  private gameSpeed = 1;

  constructor() {
    super("GameScene");
  }

  preload() {
    // Większość elementów jest rysowana proceduralnie; chatki leśnika i drwala mają prawdziwą grafikę na wyższych poziomach.
    this.load.image("lesnik_1_raw", lesnik1Url);
    this.load.image("lesnik_2_raw", lesnik2Url);
    this.load.image("lesnik_3_raw", lesnik3Url);
    this.load.image("drwal_1_raw", drwal1Url);
    this.load.image("drwal_2_raw", drwal2Url);
    this.load.image("drwal_3_raw", drwal3Url);
  }

  create() {
    // Source art was exported over a checkerboard instead of real alpha — cut it out once
    // up front into the texture keys BuildingManager actually draws with.
    for (const keys of Object.values(BUILDING_LEVEL_TEXTURE_KEYS)) {
      for (const key of keys) {
        prepareCutoutTexture(this, `${key}_raw`, key);
      }
    }

    const mapWidth = gridSettings.GRID_WIDTH * gridSettings.TILE_SIZE;
    const mapHeight = gridSettings.GRID_HEIGHT * gridSettings.TILE_SIZE;

    this.cameras.main.setBounds(0, 0, mapWidth, mapHeight);
    this.cameras.main.setBackgroundColor(0x1b2e1b);

    this.add.rectangle(0, 0, mapWidth, mapHeight, 0x3a6b35).setOrigin(0, 0).setDepth(-1000);

    this.gridManager = new GridManager(this);
    this.gridManager.createGrid();

    this.resourceManager = new ResourceManager({ wood: RESOURCE_SETTINGS.startingWood });
    this.treeManager = new TreeManager(this);
    this.riverManager = new RiverManager(this);
    this.riverManager.generateRiver();
    this.deerManager = new DeerManager(this, this.riverManager, this.treeManager);
    this.buildingManager = new BuildingManager(
      this,
      this.treeManager,
      this.resourceManager,
      this.deerManager,
      this.riverManager,
    );
    // WolfManager depends on BuildingManager (to attack workers), and the huntsman
    // behavior (built inside BuildingManager) depends on WolfManager (to hunt them) —
    // wire the second half of that cycle in now that both instances exist.
    this.wolfManager = new WolfManager(this, this.riverManager, this.deerManager, this.buildingManager);
    this.buildingManager.setWolfManager(this.wolfManager);

    this.spawnInitialForest();
    this.spawnInitialBuildings();

    this.game.registry.set("resourceManager", this.resourceManager);

    this.scene.launch("UIScene");

    this.game.events.on("selectBuildingType", (tool: PlacementTool) => {
      this.placementType = tool;
      this.gridManager.setPlacementValidator((x, y) => this.canPlaceAt(tool, x, y));
    });

    this.game.events.on("cancelPlacement", () => this.exitPlacementMode());

    this.game.events.on("setGameSpeed", (speed: number) => {
      this.gameSpeed = speed;
      // Delta-driven logic below is scaled manually; tweens (tree growth) have their
      // own global speed knob, so keep it in lockstep for a visually consistent fast-forward.
      this.tweens.timeScale = speed;
    });

    this.game.events.on("upgradeSelectedBuilding", () => this.tryUpgradeSelectedBuilding());

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.handleRightClick(pointer);
        return;
      }
      this.handleLeftClick(pointer);
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      this.exitPlacementMode();
      this.deselectBuilding();
    });
  }

  update(_time: number, delta: number) {
    const scaledDelta = delta * this.gameSpeed;

    this.buildingManager.updateWorkers(scaledDelta);
    this.deerManager.updateWander(scaledDelta);
    this.wolfManager.updateWander(scaledDelta);

    if (this.deerManager.tickSpawnTimer(scaledDelta)) {
      this.trySpawnDeer();
    }

    if (this.wolfManager.tickSpawnTimer(scaledDelta)) {
      this.trySpawnWolf();
    }

    if (this.treeManager.tickNaturalGrowthTimer(scaledDelta)) {
      this.tryNaturalTreeGrowth();
    }

    this.treeManager.updateStumpRegrowth(scaledDelta);
  }

  private tryNaturalTreeGrowth(): void {
    for (let attempt = 0; attempt < TREE_SETTINGS.spawnSearchAttempts; attempt++) {
      const x = Phaser.Math.Between(0, TREE_GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, TREE_GRID_HEIGHT - 1);

      if (this.treeManager.hasTreeAt(x, y)) continue;

      const parentGridX = Math.floor(x / SUB_TILES_PER_TILE);
      const parentGridY = Math.floor(y / SUB_TILES_PER_TILE);
      if (this.riverManager.isRiver(parentGridX, parentGridY)) continue;
      if (this.buildingManager.isTileOccupied(parentGridX, parentGridY)) continue;

      if (this.treeManager.plantTree(x, y)) return;
    }
  }

  private trySpawnDeer(): void {
    // Prefer a forested tile first (thematically, deer live in the woods)...
    for (let attempt = 0; attempt < DEER_SETTINGS.spawnSearchAttempts; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.deerManager.hasDeerAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;
      if (!this.treeManager.hasAnyTreeInBuildingTile(x, y)) continue;

      if (this.deerManager.spawnDeer(x, y)) return;
    }

    // ...but fall back to any free tile so spawning doesn't stall in a sparse forest.
    for (let attempt = 0; attempt < DEER_SETTINGS.spawnSearchAttempts; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.deerManager.hasDeerAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;

      if (this.deerManager.spawnDeer(x, y)) return;
    }
  }

  private trySpawnWolf(): void {
    // Prefer a forested tile first (wolves belong in the woods too)...
    for (let attempt = 0; attempt < WOLF_SETTINGS.spawnSearchAttempts; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.wolfManager.hasWolfAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;
      if (!this.treeManager.hasAnyTreeInBuildingTile(x, y)) continue;

      if (this.wolfManager.spawnWolf(x, y)) return;
    }

    // ...but fall back to any free tile so spawning doesn't stall in a sparse forest.
    for (let attempt = 0; attempt < WOLF_SETTINGS.spawnSearchAttempts; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.wolfManager.hasWolfAt(x, y)) continue;
      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;

      if (this.wolfManager.spawnWolf(x, y)) return;
    }
  }

  private spawnInitialForest(): void {
    let planted = 0;
    let attempts = 0;

    const maxAttempts = TREE_SETTINGS.initialForestCount * 20;
    while (planted < TREE_SETTINGS.initialForestCount && attempts < maxAttempts) {
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

  /** Every new game starts with one free woodcutter's hut already standing. */
  private spawnInitialBuildings(): void {
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = Phaser.Math.Between(0, gridSettings.GRID_WIDTH - 1);
      const y = Phaser.Math.Between(0, gridSettings.GRID_HEIGHT - 1);

      if (this.buildingManager.isTileOccupied(x, y)) continue;
      if (this.treeManager.hasAnyTreeInBuildingTile(x, y)) continue;
      if (this.riverManager.isRiver(x, y)) continue;

      if (this.buildingManager.placeBuilding(BUILDING_TYPES.woodcutter, x, y)) return;
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
    const tile = this.tileFromPointer(pointer);
    if (!tile) return;

    if (this.placementType) {
      if (!this.canPlaceAt(this.placementType, tile.x, tile.y)) {
        // A build tool stays active after placing so you can place several in a row, but
        // that shouldn't swallow a click on an existing building — otherwise placing one
        // hut silently blocks selecting/upgrading it until you notice you need Esc first.
        if (this.buildingManager.isTileOccupied(tile.x, tile.y)) {
          this.exitPlacementMode();
          this.trySelectBuildingAt(tile.x, tile.y);
        }
        return;
      }

      this.resourceManager.spend("wood", this.placementType.cost);

      if (isBridgeTool(this.placementType)) {
        this.riverManager.buildBridge(tile.x, tile.y);
      } else {
        this.buildingManager.placeBuilding(this.placementType, tile.x, tile.y);
        // Building blocking already excludes bare stumps (canPlaceAt), so any tree left
        // on this tile at this point is a stump — the building physically replaces it.
        this.treeManager.clearStumpsInBuildingTile(tile.x, tile.y);
      }

      this.game.events.emit("buildingPlaced");
      return;
    }

    this.trySelectBuildingAt(tile.x, tile.y);
  }

  private handleRightClick(pointer: Phaser.Input.Pointer): void {
    this.exitPlacementMode();
    this.deselectBuilding();

    const tile = this.tileFromPointer(pointer);
    if (!tile) return;

    const removed = this.buildingManager.removeBuildingAt(tile.x, tile.y);
    if (removed) {
      const refund = Math.round(removed.type.cost * RESOURCE_SETTINGS.demolishRefundRatio);
      if (refund > 0) this.resourceManager.add("wood", refund);
      this.game.events.emit("buildingRemoved", removed.type, refund);
      return;
    }

    if (this.isBridgeInUse(tile.x, tile.y)) return;

    if (this.riverManager.removeBridge(tile.x, tile.y)) {
      const refund = Math.round(BRIDGE_TOOL.cost * RESOURCE_SETTINGS.demolishRefundRatio);
      if (refund > 0) this.resourceManager.add("wood", refund);
      this.game.events.emit("buildingRemoved", BRIDGE_TOOL, refund);
    }
  }

  /** Workers pick a straight-line route once and never re-check it against the live river
   * state, so pulling a bridge out from under one mid-crossing would strand it walking on
   * open water. Refuse the demolish while any active worker's route still depends on it. */
  private isBridgeInUse(gridX: number, gridY: number): boolean {
    if (!this.riverManager.hasBridge(gridX, gridY)) return false;

    return this.buildingManager.getActiveWorkers().some((worker) =>
      this.riverManager.segmentPassesThroughTile(
        worker.container.x,
        worker.container.y,
        worker.homePosition.x,
        worker.homePosition.y,
        gridX,
        gridY,
      ),
    );
  }

  private exitPlacementMode(): void {
    this.placementType = null;
    this.gridManager.setPlacementValidator(null);
    this.game.events.emit("placementCancelled");
  }

  private trySelectBuildingAt(gridX: number, gridY: number): void {
    const building = this.buildingManager.getBuildingAt(gridX, gridY);
    if (!building || building === this.selectedBuilding) {
      this.deselectBuilding();
      return;
    }

    this.selectedBuilding = building;
    this.emitSelection();
  }

  private deselectBuilding(): void {
    if (!this.selectedBuilding) return;
    this.selectedBuilding = null;
    this.game.events.emit("buildingDeselected");
  }

  private emitSelection(): void {
    const building = this.selectedBuilding;
    if (!building) return;

    this.game.events.emit("buildingSelected", {
      typeName: building.type.name,
      level: building.level,
      maxLevel: BUILDING_UPGRADE_SETTINGS.maxLevel,
      workerCount: building.slots.length,
      upgradeCost: this.buildingManager.getUpgradeCost(building),
    });
  }

  private tryUpgradeSelectedBuilding(): void {
    const building = this.selectedBuilding;
    if (!building) return;

    const cost = this.buildingManager.getUpgradeCost(building);
    if (cost === null) return;

    if (!this.resourceManager.canAfford("wood", cost)) {
      this.game.events.emit("upgradeFailed");
      return;
    }

    this.resourceManager.spend("wood", cost);
    this.buildingManager.upgradeBuilding(building);
    this.game.events.emit("buildingUpgraded");
    this.emitSelection();
  }
}
