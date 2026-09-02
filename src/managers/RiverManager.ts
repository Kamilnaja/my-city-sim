import * as Phaser from "phaser";
import { gridSettings, tileCenterPx } from "../scenes/gridSettings";
import { RIVER_SETTINGS } from "../config/gameSettings";

const WATER_COLOR = 0x2f6f9e;
const BRIDGE_COLOR = 0x8a6a4a;
const SAMPLE_STEP_PX = gridSettings.TILE_SIZE / 4;
// The river only occupies a fraction of its tile's width visually; it still blocks the
// whole tile for placement/pathing (that grid stays simple), this just narrows the drawn strip.
const RIVER_WIDTH = gridSettings.TILE_SIZE * RIVER_SETTINGS.widthRatio;

type Point = { x: number; y: number };

function extendPoint(from: Point, to: Point, distance: number): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: to.x + (dx / len) * distance, y: to.y + (dy / len) * distance };
}

export class RiverManager {
  private scene: Phaser.Scene;
  private riverTiles = new Set<string>();
  // Ordered top-to-bottom column per row — lets the water be drawn as one connected
  // path through tile centers instead of separate per-tile rectangles that gap at drifts.
  private riverPath: { x: number; y: number }[] = [];
  private bridgeTiles = new Set<string>();
  private waterGraphics: Phaser.GameObjects.Graphics;
  private bridgeSprites = new Map<string, Phaser.GameObjects.Container>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.waterGraphics = scene.add.graphics();
    // Below the grid lines and everything else (which sit at depth 0 or their own
    // y-position), but above the base grass background (depth -1000).
    this.waterGraphics.setDepth(-500);
  }

  private key(gridX: number, gridY: number): string {
    return `${gridX},${gridY}`;
  }

  private addRiverTile(x: number, y: number): void {
    this.riverTiles.add(this.key(x, y));
    this.riverPath.push({ x, y });
  }

  /** Carves a single winding river from one map edge to another — vertical, horizontal, or diagonal. */
  generateRiver(): void {
    const width = gridSettings.GRID_WIDTH;
    const height = gridSettings.GRID_HEIGHT;

    this.riverTiles.clear();
    this.riverPath = [];

    const orientation = Phaser.Utils.Array.GetRandom(["vertical", "horizontal", "diagonal"]);

    if (orientation === "vertical") {
      let x = Phaser.Math.Between(Math.floor(width * 0.3), Math.floor(width * 0.7));
      for (let y = 0; y < height; y++) {
        this.addRiverTile(x, y);
        if (Phaser.Math.Between(0, 2) === 0) {
          x = Phaser.Math.Clamp(x + Phaser.Math.Between(-1, 1), 1, width - 2);
        }
      }
    } else if (orientation === "horizontal") {
      let y = Phaser.Math.Between(Math.floor(height * 0.3), Math.floor(height * 0.7));
      for (let x = 0; x < width; x++) {
        this.addRiverTile(x, y);
        if (Phaser.Math.Between(0, 2) === 0) {
          y = Phaser.Math.Clamp(y + Phaser.Math.Between(-1, 1), 1, height - 2);
        }
      }
    } else {
      // Diagonal: walk from a corner-ish start toward the opposite side, advancing
      // one or both axes each step (so it still meanders rather than a straight line).
      const goingDown = Phaser.Math.Between(0, 1) === 0; // \ vs /
      const dy = goingDown ? 1 : -1;
      let x = Phaser.Math.Between(0, Math.floor(width * 0.15));
      let y = goingDown
        ? Phaser.Math.Between(0, Math.floor(height * 0.15))
        : height - 1 - Phaser.Math.Between(0, Math.floor(height * 0.15));

      while (x < width && y >= 0 && y < height) {
        this.addRiverTile(x, y);
        const move = Phaser.Math.Between(0, 2);
        if (move !== 1) x += 1;
        if (move !== 0) y += dy;
      }
    }

    this.renderWater();
  }

  private renderWater(): void {
    this.waterGraphics.clear();
    if (this.riverPath.length === 0) return;

    // Stroke one continuous path through each tile's center so bends and drifts stay
    // visually joined instead of leaving gaps between separately-drawn tile rects.
    this.waterGraphics.lineStyle(RIVER_WIDTH, WATER_COLOR, 1);
    this.waterGraphics.beginPath();

    const points = this.riverPath.map((p) => tileCenterPx(p.x, p.y));
    const n = points.length;

    // Extend both ends outward along the path's own direction so the river visually
    // reaches the map edge regardless of whether it runs vertically, horizontally, or diagonally.
    const start = extendPoint(points[1] ?? points[0], points[0], gridSettings.TILE_SIZE);
    const end = extendPoint(points[n - 2] ?? points[n - 1], points[n - 1], gridSettings.TILE_SIZE);

    this.waterGraphics.moveTo(start.x, start.y);
    for (const pt of points) {
      this.waterGraphics.lineTo(pt.x, pt.y);
    }
    this.waterGraphics.lineTo(end.x, end.y);

    this.waterGraphics.strokePath();
  }

  isRiver(gridX: number, gridY: number): boolean {
    return this.riverTiles.has(this.key(gridX, gridY));
  }

  hasBridge(gridX: number, gridY: number): boolean {
    return this.bridgeTiles.has(this.key(gridX, gridY));
  }

  /** True where a worker or a building's footprint can actually sit — dry land, or a bridged river tile. */
  isPassable(gridX: number, gridY: number): boolean {
    return !this.isRiver(gridX, gridY) || this.hasBridge(gridX, gridY);
  }

  buildBridge(gridX: number, gridY: number): boolean {
    if (!this.isRiver(gridX, gridY) || this.hasBridge(gridX, gridY)) return false;

    this.bridgeTiles.add(this.key(gridX, gridY));

    const { x: px, y: py } = tileCenterPx(gridX, gridY);
    const container = this.scene.add.container(px, py);
    const planks = this.scene.add.rectangle(
      0,
      0,
      gridSettings.TILE_SIZE * 0.9,
      gridSettings.TILE_SIZE * 0.55,
      BRIDGE_COLOR,
    );
    container.add(planks);
    container.setDepth(py);
    this.bridgeSprites.set(this.key(gridX, gridY), container);

    return true;
  }

  removeBridge(gridX: number, gridY: number): boolean {
    const key = this.key(gridX, gridY);
    if (!this.bridgeTiles.has(key)) return false;

    this.bridgeTiles.delete(key);
    this.bridgeSprites.get(key)?.destroy();
    this.bridgeSprites.delete(key);

    return true;
  }

  private sampleSegment(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    onSample: (gx: number, gy: number) => boolean,
  ): boolean {
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const steps = Math.max(1, Math.ceil(dist / SAMPLE_STEP_PX));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const gx = Math.floor(x / gridSettings.TILE_SIZE);
      const gy = Math.floor(y / gridSettings.TILE_SIZE);

      if (onSample(gx, gy)) return true;
    }

    return false;
  }

  /** Samples a straight pixel-space segment; true if it crosses river water with no bridge. */
  segmentCrossesRiver(x1: number, y1: number, x2: number, y2: number): boolean {
    return this.sampleSegment(
      x1,
      y1,
      x2,
      y2,
      (gx, gy) => this.isRiver(gx, gy) && !this.hasBridge(gx, gy),
    );
  }

  /**
   * True if a straight pixel-space segment passes through this exact tile — used to check
   * whether a worker mid-route still needs a bridge before it's allowed to be demolished
   * (workers pick their route once and never re-check it, so pulling a bridge out from
   * under one mid-crossing would otherwise strand it on open water).
   */
  segmentPassesThroughTile(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    gridX: number,
    gridY: number,
  ): boolean {
    return this.sampleSegment(x1, y1, x2, y2, (gx, gy) => gx === gridX && gy === gridY);
  }
}
