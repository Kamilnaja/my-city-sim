export type BuildingId = "woodcutter" | "forester" | "hunter";

export interface BuildingTypeConfig {
  id: BuildingId;
  name: string;
  cost: number;
  color: number;
  roofColor: number;
  workerColor: number;
  workRadiusTiles: number;
  workDurationMs: number;
}

export const BUILDING_TYPES: Record<BuildingId, BuildingTypeConfig> = {
  forester: {
    id: "forester",
    name: "Chatka Leśnika",
    cost: 5,
    color: 0xd8c48a,
    roofColor: 0x1f4d2e,
    workerColor: 0xaed581,
    workRadiusTiles: 6,
    // Longer than the other roles: the forester now always plants the nearest empty
    // spot, so with a short duration it was refilling the area around the hut too fast.
    workDurationMs: 5500,
  },
  woodcutter: {
    id: "woodcutter",
    name: "Chatka Drwala",
    cost: 10,
    color: 0x8b5a2b,
    roofColor: 0x5c3a1a,
    workerColor: 0xd2691e,
    workRadiusTiles: 6,
    workDurationMs: 2000,
  },
  hunter: {
    id: "hunter",
    name: "Chatka Myśliwego",
    cost: 8,
    color: 0x5a5044,
    roofColor: 0x3b2f2f,
    workerColor: 0xb33a3a,
    workRadiusTiles: 9,
    workDurationMs: 3000,
  },
};

export const BUILDING_LIST = Object.values(BUILDING_TYPES);

/**
 * Real art for building types that have it, one per upgrade level from level 1 up (index 0 =
 * level 1, ...) — level 0 (the freshly-placed hut, before any upgrade) reuses the first
 * texture, since there's no separate "just placed" art. A building type with no entry here
 * just stays procedural at every level. These textures are registered by GameScene from
 * src/assets/*.jpg once cut out to a real alpha channel (see src/utils/imageProcessing.ts).
 */
export const BUILDING_LEVEL_TEXTURE_KEYS: Partial<Record<BuildingId, string[]>> = {
  forester: ["lesnik_1", "lesnik_2", "lesnik_3"],
  woodcutter: ["drwal_1", "drwal_2", "drwal_3"],
};

export interface BridgeToolConfig {
  id: "bridge";
  name: string;
  cost: number;
}

export const BRIDGE_TOOL: BridgeToolConfig = {
  id: "bridge",
  name: "Most",
  cost: 4,
};

/** Anything placeable from the build menu — a worker hut, or the river-only bridge tool. */
export type PlacementTool = BuildingTypeConfig | BridgeToolConfig;

export function isBridgeTool(tool: PlacementTool): tool is BridgeToolConfig {
  return tool.id === "bridge";
}
