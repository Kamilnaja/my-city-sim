import * as Phaser from "phaser";
import { BUILDING_LIST, BRIDGE_TOOL, type PlacementTool } from "../config/buildingTypes";
import type { ResourceManager } from "../managers/ResourceManager";

const TOOL_LIST: PlacementTool[] = [...BUILDING_LIST, BRIDGE_TOOL];
const SPEED_LEVELS = [1, 1.5, 2, 5];
const SPEED_STORAGE_KEY = "citySim.gameSpeedIndex";

const INFO_ROW_HEIGHT = 52;
const BUTTON_ROW_HEIGHT = 74;
const MENU_HEIGHT = INFO_ROW_HEIGHT + BUTTON_ROW_HEIGHT;
const PANEL_BG = 0x222222;
const BUTTON_BG = 0x3a3a3a;
const BUTTON_BG_ACTIVE = 0x4c8c4a;
const SPEED_BTN_WIDTH = 64;
const SPEED_BTN_HEIGHT = 36;
const SPEED_BTN_MARGIN = 12;
const DEFAULT_HINT =
  "Wybierz budynek/most i kliknij na mapie. PPM go rozbiera (zwrot 30%). LPM na budynku go zaznacza.";
const PLACED_HINT = "Postawiono. Wybierz kolejny element albo PPM/Esc, by anulować.";

interface SelectedBuildingInfo {
  typeName: string;
  level: number;
  maxLevel: number;
  workerCount: number;
  /** Wood cost of the next level, or null if already at max level. */
  upgradeCost: number | null;
}

const SELECTION_PANEL_WIDTH = 240;
const SELECTION_PANEL_HEIGHT = 112;
const SELECTION_PANEL_MARGIN = 12;

export class UIScene extends Phaser.Scene {
  private resourceManager!: ResourceManager;
  private activeType: PlacementTool | null = null;
  private lastHint = DEFAULT_HINT;
  private speedIndex = 0;
  private selectedInfo: SelectedBuildingInfo | null = null;

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
    this.speedIndex = this.loadSpeedIndex();

    this.buildUI();
    this.scale.on("resize", () => this.buildUI());

    // The UI reflects the restored speed via buildUI(); the simulation itself also
    // needs to hear about it, since GameScene starts out assuming normal speed.
    this.game.events.emit("setGameSpeed", SPEED_LEVELS[this.speedIndex]);

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

    this.game.events.on("buildingSelected", (info: SelectedBuildingInfo) => {
      this.selectedInfo = info;
      this.buildUI();
    });
    this.game.events.on("buildingDeselected", () => {
      this.selectedInfo = null;
      this.buildUI();
    });
    this.game.events.on("buildingUpgraded", () => {
      this.lastHint = "Budynek rozbudowany.";
    });
    this.game.events.on("upgradeFailed", () => {
      this.lastHint = "Za mało drewna na rozbudowę.";
      this.buildUI();
    });
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
    this.buildSpeedButton(width);
    if (this.selectedInfo) this.buildSelectionPanel(this.selectedInfo);
  }

  private buildSelectionPanel(info: SelectedBuildingInfo): void {
    const x = SELECTION_PANEL_MARGIN;
    const y = SELECTION_PANEL_MARGIN;

    const bg = this.add
      .rectangle(x, y, SELECTION_PANEL_WIDTH, SELECTION_PANEL_HEIGHT, PANEL_BG, 0.95)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setStrokeStyle(1, 0x555555);
    this.uiObjects.push(bg);

    const title = this.add
      .text(x + 12, y + 10, `${info.typeName} (poziom ${info.level}/${info.maxLevel})`, {
        fontSize: "14px",
        color: "#ffffff",
      })
      .setScrollFactor(0);
    this.uiObjects.push(title);

    const barWidth = 24;
    const barHeight = 10;
    const barGap = 6;
    const barY = y + 34;
    for (let i = 0; i < info.maxLevel; i++) {
      const filled = i < info.level;
      const bar = this.add
        .rectangle(
          x + 12 + i * (barWidth + barGap),
          barY,
          barWidth,
          barHeight,
          filled ? 0xffd54a : 0x444444,
        )
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setStrokeStyle(1, 0x000000, 0.4);
      this.uiObjects.push(bar);
    }

    const workersText = this.add
      .text(x + 12, y + 54, `Pracownicy: ${info.workerCount}`, {
        fontSize: "13px",
        color: "#cccccc",
      })
      .setScrollFactor(0);
    this.uiObjects.push(workersText);

    if (info.upgradeCost !== null) {
      const btnWidth = 150;
      const btnHeight = 30;
      const btnX = x + 12 + btnWidth / 2;
      const btnY = y + SELECTION_PANEL_HEIGHT - btnHeight / 2 - 10;

      const btnBg = this.add
        .rectangle(btnX, btnY, btnWidth, btnHeight, BUTTON_BG_ACTIVE)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      const btnLabel = this.add
        .text(btnX, btnY, `+1 (${info.upgradeCost} drewna)`, {
          fontSize: "13px",
          color: "#ffffff",
        })
        .setOrigin(0.5)
        .setScrollFactor(0);

      btnBg.on("pointerdown", () => {
        this.game.events.emit("upgradeSelectedBuilding");
      });

      this.uiObjects.push(btnBg, btnLabel);
    } else {
      const maxText = this.add
        .text(x + 12, y + SELECTION_PANEL_HEIGHT - 28, "Maksymalny poziom", {
          fontSize: "13px",
          color: "#88cc88",
        })
        .setScrollFactor(0);
      this.uiObjects.push(maxText);
    }
  }

  private buildSpeedButton(screenWidth: number): void {
    const x = screenWidth - SPEED_BTN_MARGIN - SPEED_BTN_WIDTH / 2;
    const y = SPEED_BTN_MARGIN + SPEED_BTN_HEIGHT / 2;

    const bg = this.add
      .rectangle(x, y, SPEED_BTN_WIDTH, SPEED_BTN_HEIGHT, this.speedButtonColor())
      .setScrollFactor(0)
      .setDepth(0)
      .setInteractive({ useHandCursor: true });

    const label = this.add
      .text(x, y, this.speedLabel(), { fontSize: "16px", color: "#ffffff" })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1);

    bg.on("pointerdown", () => {
      this.speedIndex = (this.speedIndex + 1) % SPEED_LEVELS.length;
      const speed = SPEED_LEVELS[this.speedIndex];
      bg.setFillStyle(this.speedButtonColor());
      label.setText(this.speedLabel());
      this.saveSpeedIndex(this.speedIndex);
      this.game.events.emit("setGameSpeed", speed);
    });

    this.uiObjects.push(bg, label);
  }

  private speedLabel(): string {
    return `⏩ x${SPEED_LEVELS[this.speedIndex]}`;
  }

  private speedButtonColor(): number {
    return this.speedIndex === 0 ? BUTTON_BG : BUTTON_BG_ACTIVE;
  }

  private loadSpeedIndex(): number {
    try {
      const saved = localStorage.getItem(SPEED_STORAGE_KEY);
      if (saved === null) return 0;
      const index = parseInt(saved, 10);
      if (Number.isInteger(index) && index >= 0 && index < SPEED_LEVELS.length) {
        return index;
      }
    } catch {
      // localStorage unavailable (private mode, disabled storage, etc.) — default speed.
    }
    return 0;
  }

  private saveSpeedIndex(index: number): void {
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, String(index));
    } catch {
      // Non-fatal — the speed just won't persist across reloads.
    }
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
