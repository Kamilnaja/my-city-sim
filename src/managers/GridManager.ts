import * as Phaser from "phaser";
import { gridSettings } from "../scenes/gridSettings";

export class GridManager {
  private scene: Phaser.Scene;
  private gridGraphics: Phaser.GameObjects.Graphics;
  private hoverGraphics: Phaser.GameObjects.Graphics;
  private placementValidator: ((gridX: number, gridY: number) => boolean) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.gridGraphics = this.scene.add.graphics();
    this.hoverGraphics = this.scene.add.graphics();
  }

  /** Pass a validity check to color the hover tile green/red while placing a building, or null to clear. */
  public setPlacementValidator(fn: ((gridX: number, gridY: number) => boolean) | null): void {
    this.placementValidator = fn;
  }

  public createGrid() {
    this.gridGraphics.lineStyle(1, 0xffffff, 0.2);

    for (let x = 0; x <= gridSettings.MAP_WIDTH; x++) {
      this.gridGraphics.moveTo(x * gridSettings.TILE_SIZE, 0);
      this.gridGraphics.lineTo(
        x * gridSettings.TILE_SIZE,
        gridSettings.GRID_HEIGHT * gridSettings.TILE_SIZE,
      );
    }
    for (let y = 0; y <= gridSettings.MAP_HEIGHT; y++) {
      this.gridGraphics.moveTo(0, y * gridSettings.TILE_SIZE);
      this.gridGraphics.lineTo(
        gridSettings.GRID_WIDTH * gridSettings.TILE_SIZE,
        y * gridSettings.TILE_SIZE,
      );
    }
    this.gridGraphics.strokePath();

    this.scene.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateHover(pointer);
    });
  }

  private updateHover(pointer: Phaser.Input.Pointer): void {
    this.hoverGraphics.clear();

    const gridX = Math.floor(pointer.worldX / gridSettings.TILE_SIZE);
    const gridY = Math.floor(pointer.worldY / gridSettings.TILE_SIZE);

    if (
      gridX >= 0 &&
      gridX < gridSettings.GRID_WIDTH &&
      gridY >= 0 &&
      gridY < gridSettings.GRID_HEIGHT
    ) {
      let color = 0xffffff;
      let alpha = 0.15;
      let valid = true;

      if (this.placementValidator) {
        valid = this.placementValidator(gridX, gridY);
        color = valid ? 0x00ff00 : 0xff0000;
        alpha = valid ? 0.4 : 0.55;
      }

      this.hoverGraphics.fillStyle(color, alpha);
      this.hoverGraphics.fillRect(
        gridX * gridSettings.TILE_SIZE,
        gridY * gridSettings.TILE_SIZE,
        gridSettings.TILE_SIZE,
        gridSettings.TILE_SIZE,
      );

      if (this.placementValidator && !valid) {
        // A flat tint over grass reads as muddy brown rather than "blocked" — an
        // outline makes the invalid state unambiguous regardless of what's underneath.
        this.hoverGraphics.lineStyle(3, 0xff0000, 0.9);
        this.hoverGraphics.strokeRect(
          gridX * gridSettings.TILE_SIZE + 1.5,
          gridY * gridSettings.TILE_SIZE + 1.5,
          gridSettings.TILE_SIZE - 3,
          gridSettings.TILE_SIZE - 3,
        );
      }
    }
  }
}
