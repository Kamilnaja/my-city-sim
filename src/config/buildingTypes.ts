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
    workDurationMs: 2500,
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
