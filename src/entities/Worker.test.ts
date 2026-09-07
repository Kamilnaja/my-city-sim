import { describe, expect, it, vi } from "vitest";
import { Worker, type WorkerBehavior, type WorkTarget } from "./Worker";
import { WORKER_SETTINGS } from "../config/gameSettings";
import { tileCenterPx } from "../scenes/gridSettings";
import type { BuildingTypeConfig } from "../config/buildingTypes";
import { createFakeScene } from "../testUtils/fakeScene";

const CONFIG: BuildingTypeConfig = {
  id: "woodcutter",
  name: "Test Hut",
  cost: 10,
  color: 0,
  roofColor: 0,
  workerColor: 0,
  workRadiusTiles: 6,
  workDurationMs: 1000,
};

/** Advances the worker in small fixed steps for a total of `totalMs`, one tick at a time. */
function advance(worker: Worker, totalMs: number, stepMs = 50): void {
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    worker.update(stepMs);
  }
}

/**
 * Advances the worker tick by tick, stopping the instant it's within `thresholdPx` of
 * `point` — as opposed to `advance`'s fixed budget, which (once a worker arrives home)
 * would let it immediately pick a new target and wander off again before the loop ends.
 */
function advanceUntilNear(
  worker: Worker,
  point: { x: number; y: number },
  thresholdPx: number,
  stepMs = 20,
  maxSteps = 1000,
): void {
  for (let i = 0; i < maxSteps; i++) {
    if (Math.hypot(worker.container.x - point.x, worker.container.y - point.y) <= thresholdPx) return;
    worker.update(stepMs);
  }
  throw new Error("advanceUntilNear: never got close enough");
}

function travelTimeMs(distancePx: number): number {
  return (distancePx / WORKER_SETTINGS.speedPxPerSec) * 1000;
}

describe("Worker state machine", () => {
  it("starts idle at its home position", () => {
    const { scene } = createFakeScene();
    const behavior: WorkerBehavior = {
      findTarget: () => null,
      onWorkComplete: () => {},
    };
    const worker = new Worker(scene, 2, 2, CONFIG, behavior);

    const home = tileCenterPx(2, 2);
    expect(worker.homePosition).toEqual({ x: home.x, y: home.y + 20 });
  });

  it("stays idle and retries later when findTarget returns null", () => {
    const { scene } = createFakeScene();
    const findTarget = vi.fn().mockReturnValue(null);
    const behavior: WorkerBehavior = { findTarget, onWorkComplete: () => {} };
    const worker = new Worker(scene, 0, 0, CONFIG, behavior);

    worker.update(16);
    expect(findTarget).toHaveBeenCalledTimes(1);

    // Still inside the idle-retry cooldown: shouldn't ask again immediately.
    worker.update(16);
    expect(findTarget).toHaveBeenCalledTimes(1);
  });

  it("walks to a target, works, then returns home and completes the cycle", () => {
    const { scene } = createFakeScene();
    const target: WorkTarget = { px: 200, py: 0 };
    const onWorkComplete = vi.fn();
    const behavior: WorkerBehavior = {
      findTarget: () => target,
      onWorkComplete,
    };
    const worker = new Worker(scene, 0, 0, CONFIG, behavior);
    const home = worker.homePosition;
    const distance = Math.hypot(target.px - home.x, target.py - home.y);

    // Still well short of the target: hasn't started working yet.
    advance(worker, travelTimeMs(distance) / 2);
    expect(onWorkComplete).not.toHaveBeenCalled();

    // Enough time to arrive and sit through the full work duration (plus a small buffer
    // for the extra tick moveToward needs to notice it has already arrived).
    advance(worker, travelTimeMs(distance) / 2 + CONFIG.workDurationMs + 200);
    expect(onWorkComplete).toHaveBeenCalledTimes(1);
    expect(onWorkComplete).toHaveBeenCalledWith(worker, target);

    // RETURNING: it should make its way back home (and stop there, at least momentarily,
    // before idling and potentially setting off on another round trip).
    advanceUntilNear(worker, home, WORKER_SETTINGS.arriveThresholdPx);
  });

  it("calls onCancel with the in-flight target when destroyed mid-task", () => {
    const { scene } = createFakeScene();
    const target: WorkTarget = { px: 1000, py: 1000 };
    const onCancel = vi.fn();
    const behavior: WorkerBehavior = {
      findTarget: () => target,
      onWorkComplete: () => {},
      onCancel,
    };
    const worker = new Worker(scene, 0, 0, CONFIG, behavior);

    worker.update(16); // picks the target, starts moving (won't arrive — it's far away)
    worker.destroy();

    expect(onCancel).toHaveBeenCalledWith(worker, target);
  });

  it("does not call onCancel when destroyed while idle", () => {
    const { scene } = createFakeScene();
    const onCancel = vi.fn();
    const behavior: WorkerBehavior = {
      findTarget: () => null,
      onWorkComplete: () => {},
      onCancel,
    };
    const worker = new Worker(scene, 0, 0, CONFIG, behavior);

    worker.destroy();

    expect(onCancel).not.toHaveBeenCalled();
  });
});
