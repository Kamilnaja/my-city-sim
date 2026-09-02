export type BuildingId = "woodcutter" | "forester";

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
};

export const BUILDING_LIST = Object.values(BUILDING_TYPES);
