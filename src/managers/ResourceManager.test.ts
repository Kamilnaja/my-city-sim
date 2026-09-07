import { describe, expect, it } from "vitest";
import { ResourceManager } from "./ResourceManager";

describe("ResourceManager", () => {
  it("starts at zero unless given initial amounts", () => {
    const rm = new ResourceManager();
    expect(rm.get("wood")).toBe(0);
    expect(rm.get("meat")).toBe(0);
  });

  it("accepts partial initial amounts", () => {
    const rm = new ResourceManager({ wood: 20 });
    expect(rm.get("wood")).toBe(20);
    expect(rm.get("meat")).toBe(0);
  });

  it("adds resources and emits a change event", () => {
    const rm = new ResourceManager();
    const seen: [string, number][] = [];
    rm.events.on("change", (id: string, amount: number) => seen.push([id, amount]));

    rm.add("wood", 5);

    expect(rm.get("wood")).toBe(5);
    expect(seen).toEqual([["wood", 5]]);
  });

  it("reports affordability based on current balance", () => {
    const rm = new ResourceManager({ wood: 10 });
    expect(rm.canAfford("wood", 10)).toBe(true);
    expect(rm.canAfford("wood", 11)).toBe(false);
  });

  it("spends resources only when affordable, and emits on success", () => {
    const rm = new ResourceManager({ wood: 10 });
    const seen: [string, number][] = [];
    rm.events.on("change", (id: string, amount: number) => seen.push([id, amount]));

    expect(rm.spend("wood", 4)).toBe(true);
    expect(rm.get("wood")).toBe(6);
    expect(seen).toEqual([["wood", 6]]);
  });

  it("refuses to spend more than the balance and leaves it untouched", () => {
    const rm = new ResourceManager({ wood: 3 });
    const seen: unknown[] = [];
    rm.events.on("change", () => seen.push(1));

    expect(rm.spend("wood", 4)).toBe(false);
    expect(rm.get("wood")).toBe(3);
    expect(seen).toHaveLength(0);
  });

  it("tracks wood and meat independently", () => {
    const rm = new ResourceManager({ wood: 5, meat: 5 });
    rm.spend("wood", 5);
    expect(rm.get("wood")).toBe(0);
    expect(rm.get("meat")).toBe(5);
  });
});
