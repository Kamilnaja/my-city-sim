/**
 * Central place for the simulation's tunable numbers — speeds, timers, costs, radii —
 * so rebalancing the game doesn't mean hunting through manager/entity implementation
 * files. Grid dimensions live in scenes/gridSettings.ts and per-building stats (cost,
 * color, radius, work duration) live in config/buildingTypes.ts; both are already
 * self-contained "settings" files in their own right, so they stay put.
 */

export const RESOURCE_SETTINGS = {
  startingWood: 20,
  /** Fraction of a building's cost refunded when it's demolished. */
  demolishRefundRatio: 0.3,
  meatPerHunt: 3,
};

export const WORKER_SETTINGS = {
  speedPxPerSec: 90,
  arriveThresholdPx: 3,
  /** How long an idle worker waits before retrying if it found nothing to do. */
  idleRetryMs: 1000,
  /** How long a hut sits empty after a wolf kills its worker before a new one moves in. */
  respawnDelayMs: 12000,
};

export const TREE_SETTINGS = {
  initialForestCount: 180,
  /** Time for a freshly planted (or regrowing) sapling to reach full size and become choppable. */
  growthDurationMs: 6000,
  /** Background regrowth — much slower than a forester actively replanting. */
  naturalGrowthMinMs: 50000,
  naturalGrowthMaxMs: 90000,
  spawnSearchAttempts: 20,
  /** How long a cut/eaten tree sits as a buildable stump before it starts sprouting again. */
  stumpDurationMs: 15000,
};

export const DEER_SETTINGS = {
  spawnIntervalMinMs: 8000,
  spawnIntervalMaxMs: 16000,
  maxDeer: 5,
  spawnSearchAttempts: 20,
  wanderSpeedPxPerSec: 35,
  wanderRadiusTiles: 3,
  wanderIdleMinMs: 2000,
  wanderIdleMaxMs: 5000,
  arriveThresholdPx: 3,
  wanderTargetAttempts: 8,
  /** Chance, each time a deer picks a new wander action, that it goes to eat a nearby tree instead. */
  eatTreeChancePercent: 30,
  /** How long a deer stands at the tree before it's gone — slow, but a real cost to the forest. */
  eatDurationMs: 2500,
};

export const WOLF_SETTINGS = {
  spawnIntervalMinMs: 20000,
  spawnIntervalMaxMs: 40000,
  /** Deer needed to sustain one wolf — keeps the wolf population well below the deer population. */
  deerPerWolf: 2,
  /** Absolute ceiling on wolves regardless of how abundant deer get. */
  maxWolvesHardCap: 3,
  /** New wolves only spawn once the deer population reaches at least this many — scarce deer starves out growth. */
  minDeerCountToSpawn: 3,
  spawnSearchAttempts: 20,
  wanderSpeedPxPerSec: 50,
  wanderRadiusTiles: 5,
  wanderIdleMinMs: 2000,
  wanderIdleMaxMs: 5000,
  arriveThresholdPx: 3,
  wanderTargetAttempts: 8,
  /** Chance, each time a wolf picks a new wander action, that it stalks nearby prey instead. */
  attackChancePercent: 40,
  /** How long a wolf spends on the kill once it reaches its target. */
  attackDurationMs: 1500,
};

export const RIVER_SETTINGS = {
  /** Fraction of a tile's width the river visually occupies. */
  widthRatio: 0.5,
};

export const BUILDING_UPGRADE_SETTINGS = {
  /** Highest level a building can reach — that many level bars, housing level+1 workers. */
  maxLevel: 3,
};
