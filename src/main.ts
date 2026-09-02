import * as Phaser from "phaser";
import { GameScene } from "./scenes/gameScene";
import { UIScene } from "./scenes/uiScene";

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: window.innerWidth,
    height: window.innerHeight,
  },
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  disableContextMenu: true,
  scene: [GameScene, UIScene],
};

export const game = new Phaser.Game(config);
