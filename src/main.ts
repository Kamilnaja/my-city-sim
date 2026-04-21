import * as Phaser from "phaser";
import { GameScene } from "./scenes/gameScene";

// 1. Definicja konfiguracji gry
const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "app",
  width: window.innerWidth,
  height: window.innerHeight,
  physics: {
    default: "arcade",
    arcade: { debug: false },
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  scene: [GameScene],
};

export const game = new Phaser.Game(config);

window.addEventListener("resize", () => {
  game.scale.resize(window.innerWidth, window.innerHeight);
});
