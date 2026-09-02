import * as Phaser from "phaser";

export class ResourceManager {
  public readonly events = new Phaser.Events.EventEmitter();
  private wood: number;

  constructor(startingWood: number) {
    this.wood = startingWood;
  }

  getWood(): number {
    return this.wood;
  }

  canAfford(cost: number): boolean {
    return this.wood >= cost;
  }

  spend(cost: number): boolean {
    if (!this.canAfford(cost)) return false;
    this.wood -= cost;
    this.events.emit("change", this.wood);
    return true;
  }

  addWood(amount: number): void {
    this.wood += amount;
    this.events.emit("change", this.wood);
  }
}
