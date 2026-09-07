# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

`my-city-sim` is a browser-based, grid-based village/city simulation prototype built with **Phaser 4**, **TypeScript**, and **Vite**. Villagers (workers) live in huts, walk out to gather wood, replant trees, or hunt deer/wolves, and bring resources home. There's no backend — it's a single static page.

Note: game UI text, some in-code comments, and `TODO` are written in Polish.

## Commands

```bash
npm run dev       # start Vite dev server with hot reload
npm run build     # tsc typecheck (noEmit) + vite production build to dist/
npm run preview   # serve the production build locally
```

There is no lint script and no automated test runner configured (no unit/e2e test framework in `package.json`). `scripts/bridge-removal-test.mjs` is an ad-hoc Playwright scenario script from past manual debugging (bridge demolition mid-crossing); it expects a `window.__debugGame` hook that is **not** currently wired up in `src/main.ts`, and `playwright` is not a listed dependency — treat it as a reference for how to drive a manual repro, not a runnable test.

## Architecture

### Scenes and cross-scene communication

- `src/main.ts` creates the single `Phaser.Game`, registering two scenes: `GameScene` and `UIScene`.
- `src/scenes/gameScene.ts` owns all simulation state and logic: creates every manager, drives the update loop, and handles all pointer/keyboard input (left click = select/place, right click = demolish, Esc = cancel/deselect).
- `src/scenes/uiScene.ts` is a separate, purely presentational scene (the bottom toolbar, resource counters, selection panel, speed button). It never touches simulation state directly.
- The two scenes never call each other's methods. They communicate exclusively through the global `this.game.events` `EventEmitter` (e.g. `selectBuildingType`, `cancelPlacement`, `setGameSpeed`, `buildingSelected`/`buildingDeselected`, `buildingPlaced`/`buildingRemoved`/`buildingUpgraded`, `upgradeSelectedBuilding`/`upgradeFailed`). When adding a new UI-affecting action, add an event rather than reaching into the other scene.
- `ResourceManager` has its own `events` emitter (`change`) that `UIScene` subscribes to directly (it's shared via `game.registry.set("resourceManager", ...)`), independent of the `game.events` bus used for everything else.

### Manager pattern

Each simulation concern is a standalone manager class under `src/managers/`, constructed and owned by `GameScene`, with dependencies passed explicitly through constructors (no DI container/singletons):

- `GridManager` — draws the grid and the hover highlight (green/red validity tint) via a pluggable `placementValidator` callback.
- `ResourceManager` — a simple `{wood, meat}` counter with a change event.
- `TreeManager` — trees live on a **finer sub-grid** than buildings (`SUB_TILES_PER_TILE` slots per building tile, see `src/scenes/gridSettings.ts`), so several trees fit in the space of one hut. Handles growth, stumps/regrowth, and chopping.
- `RiverManager` — procedurally carves one winding river (vertical/horizontal/diagonal) across the map, renders it as one continuous stroked path, and owns bridges. `segmentCrossesRiver` is used everywhere a worker's straight-line path needs to check whether it's blocked by unbridged water.
- `DeerManager` / `WolfManager` — wandering animals with their own spawn timers and AI (deer graze trees; wolves hunt deer and workers). `WolfManager` depends on `BuildingManager` (to attack workers), and `BuildingManager`'s hunter behavior depends on `WolfManager` — this circular dependency is broken by constructing `BuildingManager` first, then `WolfManager`, then calling `buildingManager.setWolfManager(wolfManager)` (see `GameScene.create()`).
- `BuildingManager` — owns placed buildings, their art/level bars, and worker slots (one per level, `level + 1` workers). Delegates per-building-type AI to `src/managers/WorkerBehaviors.ts`.

### Worker behavior strategy pattern

`src/entities/Worker.ts` is a generic finite-state machine (`IDLE → MOVING_TO_TARGET → WORKING → RETURNING → IDLE`) with no knowledge of what a "target" means. Each building type supplies a `WorkerBehavior` (`findTarget`, `onWorkComplete`, optional `onCancel`) built by a factory function in `WorkerBehaviors.ts` (`createForesterBehavior`, `createWoodcutterBehavior`, `createHuntsmanBehavior`). To add a new job type: add a `BuildingId`/config entry in `src/config/buildingTypes.ts`, write a new `create*Behavior` factory, and register it in `BuildingManager`'s `behaviors` map.

### Configuration is split by role, not merged

- `src/scenes/gridSettings.ts` — grid/tile dimensions and pixel-conversion helpers (`tileCenterPx`, `subTileCenterPx`).
- `src/config/buildingTypes.ts` — per-building-type identity (cost, colors, work radius/duration, which sprites it uses at which upgrade level).
- `src/config/gameSettings.ts` — every other tunable number (speeds, timers, spawn rates, upgrade costs), grouped by system (`WORKER_SETTINGS`, `TREE_SETTINGS`, `DEER_SETTINGS`, `WOLF_SETTINGS`, `RIVER_SETTINGS`, `BUILDING_UPGRADE_SETTINGS`, `RESOURCE_SETTINGS`).

When rebalancing, prefer editing these config files over hardcoding numbers in manager/entity logic.

### Art

Most game objects are drawn procedurally (Phaser `Rectangle`/`Triangle`/`Graphics`). The forester and woodcutter huts additionally have real photo-based art for their upgrade levels (`src/assets/*.jpg`), registered by `BUILDING_LEVEL_TEXTURE_KEYS` in `buildingTypes.ts`. That source art sits on a flat checkerboard instead of real alpha, so `src/utils/imageProcessing.ts` (`prepareCutoutTexture`) flood-fills the checkerboard to transparency and crops to the opaque silhouette once at scene `preload`/`create` time, producing the texture keys `BuildingManager` actually draws with (e.g. `lesnik_1` from `lesnik_1_raw`).

### Game speed

`UIScene`'s speed button cycles through `SPEED_LEVELS` and persists the chosen index to `localStorage`; on load it restores the index and emits `setGameSpeed` so `GameScene` picks it up. `GameScene.update()` scales `delta` by `gameSpeed` manually for all simulation timers, and separately sets `this.tweens.timeScale` so tree-growth tweens stay in sync with the same speed multiplier.
