import * as Phaser from "phaser";
import { gridSettings } from "./gridSettings";

export class GameScene extends Phaser.Scene {
  private gridGraphics!: Phaser.GameObjects.Graphics;
  private hoverGraphics!: Phaser.GameObjects.Graphics;
  private points: number = 0;
  private pointsText!: Phaser.GameObjects.Text;
  constructor() {
    super("GameScene");
  }

  preload() {
    // Ładowanie grafik budynków i dróg
  }

  create() {
    this.addText();
    this.addButton();
    this.addTiles();
  }

  private addTiles() {
    this.gridGraphics = this.add.graphics();
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

    // 2. Grafika podświetlenia (wskaźnik myszy)
    this.hoverGraphics = this.add.graphics();

    // 3. Obsługa ruchu myszy
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      this.updateHover(pointer);
    });
  }

  private addButton() {
    const button = this.add.container(100, 100); // Kontener ułatwia zarządzanie grupą obiektów

    const btnBg = this.add
      .rectangle(0, 0, 150, 50, 0x3366ff)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add
      .text(0, 0, "DODAJ PUNKTY", {
        fontSize: "18px",
        color: "#ffffff",
      })
      .setOrigin(0.5);

    button.add([btnBg, btnText]);

    btnBg.on("pointerdown", () => {
      this.addPoints(10);

      // Efekt wizualny kliknięcia
      btnBg.setFillStyle(0x2244aa);
    });

    btnBg.on("pointerup", () => {
      btnBg.setFillStyle(0x3366ff);
    });
  }

  private addText() {
    this.pointsText = this.add.text(20, 20, `Punkty: ${this.points}`, {
      fontSize: "24px",
      color: "#ffffff",
      backgroundColor: "#000000aa",
      padding: { x: 10, y: 5 },
    });

    this.pointsText.setScrollFactor(0);
  }

  private addPoints(amount: number): void {
    this.points += amount;
    // Aktualizacja tekstu na ekranie
    this.pointsText.setText(`Punkty: ${this.points}`);

    console.log(`Aktualna liczba punktów: ${this.points}`);
  }
  update(time: number, delta: number) {
    // Obliczenia ekonomiczne (np. co sekundę)
  }

  private updateHover(pointer: Phaser.Input.Pointer): void {
    this.hoverGraphics.clear();

    // Obliczanie współrzędnych kafelka
    const gridX = Math.floor(pointer.x / gridSettings.TILE_SIZE);
    const gridY = Math.floor(pointer.y / gridSettings.TILE_SIZE);

    // Sprawdzanie czy mysz jest w granicach siatki
    if (
      gridX >= 0 &&
      gridX < gridSettings.GRID_WIDTH &&
      gridY >= 0 &&
      gridY < gridSettings.GRID_HEIGHT
    ) {
      this.hoverGraphics.fillStyle(0x00ff00, 0.4);
      this.hoverGraphics.fillRect(
        gridX * gridSettings.TILE_SIZE,
        gridY * gridSettings.TILE_SIZE,
        gridSettings.TILE_SIZE,
        gridSettings.TILE_SIZE,
      );
    }
  }
}
