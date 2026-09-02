import * as Phaser from "phaser";

export type ResourceId = "wood" | "meat";

export class ResourceManager {
  public readonly events = new Phaser.Events.EventEmitter();
  private amounts: Record<ResourceId, number>;

  constructor(initial: Partial<Record<ResourceId, number>> = {}) {
    this.amounts = { wood: 0, meat: 0, ...initial };
  }

  get(id: ResourceId): number {
    return this.amounts[id];
  }

  canAfford(id: ResourceId, cost: number): boolean {
    return this.amounts[id] >= cost;
  }

  spend(id: ResourceId, cost: number): boolean {
    if (!this.canAfford(id, cost)) return false;
    this.amounts[id] -= cost;
    this.events.emit("change", id, this.amounts[id]);
    return true;
  }

  add(id: ResourceId, amount: number): void {
    this.amounts[id] += amount;
    this.events.emit("change", id, this.amounts[id]);
  }
}
