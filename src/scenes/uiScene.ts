import * as Phaser from "phaser";
import { BUILDING_LIST, BRIDGE_TOOL, type PlacementTool } from "../config/buildingTypes";
import type { ResourceManager } from "../managers/ResourceManager";

const TOOL_LIST: PlacementTool[] = [...BUILDING_LIST, BRIDGE_TOOL];

const INFO_ROW_HEIGHT = 52;
const BUTTON_ROW_HEIGHT = 74;
const MENU_HEIGHT = INFO_ROW_HEIGHT + BUTTON_ROW_HEIGHT;
const PANEL_BG = 0x222222;
const BUTTON_BG = 0x3a3a3a;
const BUTTON_BG_ACTIVE = 0x4c8c4a;
const DEFAULT_HINT =
  "Wybierz budynek/most i kliknij na mapie. PPM go rozbiera (zwrot 30%).";
const PLACED_HINT = "Postawiono. Wybierz kolejny element albo PPM/Esc, by anulować.";

export class UIScene extends Phaser.Scene {
  private resourceManager!: ResourceManager;
  private activeType: PlacementTool | null = null;
  private lastHint = DEFAULT_HINT;

  private uiObjects: Phaser.GameObjects.GameObject[] = [];
  private woodText!: Phaser.GameObjects.Text;
  private meatText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private buttons: Array<{
    type: PlacementTool;
    bg: Phaser.GameObjects.Rectangle;
    label: Phaser.GameObjects.Text;
  }> = [];

  constructor() {
    super("UIScene");
  }

  create() {
    this.resourceManager = this.game.registry.get("resourceManager") as ResourceManager;

    this.buildUI();
    this.scale.on("resize", () => this.buildUI());

    this.resourceManager.events.on("change", () => this.refreshResources());

    this.game.events.on("placementCancelled", () => this.setActive(null));
    this.game.events.on("buildingPlaced", () => {
      this.lastHint = PLACED_HINT;
      // Rebuild rather than just setText: button positions depend on hint
      // text width, and PLACED_HINT is wider than DEFAULT_HINT.
      this.buildUI();
    });
    this.game.events.on(
      "buildingRemoved",
      (type: PlacementTool, refund: number) => {
        this.lastHint = `Rozebrano: ${type.name} (+${refund} drewna).`;
        this.buildUI();
      },
    );
  }

  private buildUI(): void {
    for (const obj of this.uiObjects) obj.destroy();
    this.uiObjects = [];
    this.buttons = [];

    const { width, height } = this.scale;

    const panel = this.add
      .rectangle(0, height - MENU_HEIGHT, width, MENU_HEIGHT, PANEL_BG)
      .setOrigin(0, 0)
      .setScrollFactor(0);
    this.uiObjects.push(panel);

    // Info row (wood counter + hint) sits above the button row — separate bands,
    // so long hint copy can never run under a button no matter how it's sized.
    const infoRowTop = height - MENU_HEIGHT;
    const buttonRowCenterY = height - BUTTON_ROW_HEIGHT / 2;

    this.woodText = this.add
      .text(20, infoRowTop + 6, "", {
        fontSize: "18px",
        color: "#e8d9a0",
      })
      .setScrollFactor(0);
    this.uiObjects.push(this.woodText);

    this.meatText = this.add
      .text(20, infoRowTop + 6, "", {
        fontSize: "18px",
        color: "#e0a985",
      })
      .setScrollFactor(0);
    this.uiObjects.push(this.meatText);

    this.refreshResources();

    this.hintText = this.add
      .text(20, infoRowTop + 27, this.lastHint, {
        fontSize: "12px",
        color: "#aaaaaa",
        wordWrap: { width: Math.max(200, width - 40) },
      })
      .setScrollFactor(0);
    this.uiObjects.push(this.hintText);

    let left = 20;
    for (const type of TOOL_LIST) {
      const label = `${type.name}\n(${type.cost} drewna)`;
      const text = this.add
        .text(0, 0, label, {
          fontSize: "14px",
          color: "#ffffff",
          align: "center",
        })
        .setOrigin(0.5);

      const btnWidth = Math.max(150, text.width + 24);
      const x = left + btnWidth / 2;
      const bg = this.add
        .rectangle(x, buttonRowCenterY, btnWidth, BUTTON_ROW_HEIGHT - 16, BUTTON_BG)
        .setScrollFactor(0)
        .setDepth(0)
        .setInteractive({ useHandCursor: true });

      text.setPosition(x, buttonRowCenterY).setScrollFactor(0).setDepth(1);

      bg.on("pointerdown", () => {
        const alreadyActive = this.activeType === type;
        this.setActive(alreadyActive ? null : type);
        if (alreadyActive) {
          this.game.events.emit("cancelPlacement");
        } else {
          this.game.events.emit("selectBuildingType", type);
        }
      });

      this.uiObjects.push(bg, text);
      this.buttons.push({ type, bg, label: text });
      left += btnWidth + 12;
    }

    this.setActive(this.activeType);
  }

  private refreshResources(): void {
    this.woodText.setText(`🪵 Drewno: ${this.resourceManager.get("wood")}`);
    this.meatText.setText(`🍖 Mięso: ${this.resourceManager.get("meat")}`);
    // Positioned after refreshing text, so it always clears the wood counter's
    // actual current width instead of an assumed fixed offset.
    this.meatText.setX(this.woodText.x + this.woodText.width + 24);
  }

  private setActive(type: PlacementTool | null): void {
    this.activeType = type;
    for (const btn of this.buttons) {
      btn.bg.setFillStyle(btn.type === type ? BUTTON_BG_ACTIVE : BUTTON_BG);
    }
  }
}
