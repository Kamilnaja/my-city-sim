import type * as Phaser from "phaser";

/**
 * Minimal stand-ins for the Phaser GameObjects/Scene API surface the managers use, so
 * manager/entity logic can be unit-tested without booting a real (rendering) Phaser.Game.
 * Not a faithful Phaser reimplementation — only the methods actually called in this codebase.
 */

function makeFakeGraphics() {
  const g: any = {
    clearCalls: 0,
    lineStyle: () => g,
    fillStyle: () => g,
    beginPath: () => g,
    moveTo: () => g,
    lineTo: () => g,
    strokePath: () => g,
    fillRect: () => g,
    strokeRect: () => g,
    clear: () => {
      g.clearCalls++;
      return g;
    },
    setDepth: () => g,
  };
  return g;
}

function makeFakeGameObject(overrides: Record<string, any> = {}) {
  const obj: any = {
    x: 0,
    y: 0,
    visible: true,
    scale: 1,
    depth: 0,
    rotation: 0,
    destroyed: false,
    setVisible(v: boolean) {
      obj.visible = v;
      return obj;
    },
    setScale(s: number) {
      obj.scale = s;
      return obj;
    },
    setDepth(d: number) {
      obj.depth = d;
      return obj;
    },
    setPosition(x: number, y: number) {
      obj.x = x;
      obj.y = y;
      return obj;
    },
    setStrokeStyle() {
      return obj;
    },
    setRotation(r: number) {
      obj.rotation = r;
      return obj;
    },
    setOrigin() {
      return obj;
    },
    destroy() {
      obj.destroyed = true;
    },
    ...overrides,
  };
  return obj;
}

function makeFakeContainer(x = 0, y = 0) {
  const children: any[] = [];
  const container: any = {
    x,
    y,
    children,
    depth: 0,
    scale: 1,
    destroyed: false,
    add(objs: any) {
      children.push(...(Array.isArray(objs) ? objs : [objs]));
      return container;
    },
    addAt(objs: any) {
      children.unshift(...(Array.isArray(objs) ? objs : [objs]));
      return container;
    },
    setDepth(d: number) {
      container.depth = d;
      return container;
    },
    setPosition(px: number, py: number) {
      container.x = px;
      container.y = py;
      return container;
    },
    setScale(s: number) {
      container.scale = s;
      return container;
    },
    destroy() {
      container.destroyed = true;
    },
  };
  return container;
}

export interface FakeScene {
  scene: Phaser.Scene;
  /** Every config object passed to scene.tweens.add(...), in call order. */
  tweenCalls: any[];
}

export function createFakeScene(): FakeScene {
  const tweenCalls: any[] = [];

  const scene = {
    add: {
      graphics: () => makeFakeGraphics(),
      container: (x?: number, y?: number) => makeFakeContainer(x, y),
      rectangle: (..._args: any[]) => makeFakeGameObject(),
      circle: (..._args: any[]) => makeFakeGameObject(),
      ellipse: (..._args: any[]) => makeFakeGameObject(),
      triangle: (..._args: any[]) => makeFakeGameObject(),
      image: (..._args: any[]) => makeFakeGameObject({ width: 100, displayHeight: 50 }),
    },
    tweens: {
      add: (config: any) => {
        tweenCalls.push(config);
        return {};
      },
    },
    input: {
      on: () => {},
    },
  };

  return { scene: scene as unknown as Phaser.Scene, tweenCalls };
}
