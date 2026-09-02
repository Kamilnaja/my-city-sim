import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:5175";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1300, height: 1450 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(2000);

const setup = await page.evaluate(() => {
  const scene = window.__debugGame.scene.getScene("GameScene");
  const river = scene["riverManager"];
  const buildings = scene["buildingManager"];
  const trees = scene["treeManager"];
  const W = 20, H = 20;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

  for (let gx = 0; gx < W; gx++) {
    for (let gy = 0; gy < H; gy++) {
      if (!river.isRiver(gx, gy)) continue;
      for (const [dx, dy] of dirs) {
        const ngx = gx + dx, ngy = gy + dy;
        if (ngx < 0 || ngy < 0 || ngx >= W || ngy >= H) continue;
        if (river.isRiver(ngx, ngy)) continue;
        if (buildings.isTileOccupied(ngx, ngy)) continue;
        if (trees.hasAnyTreeInBuildingTile(ngx, ngy)) continue;

        let fx = gx, fy = gy, steps = 0;
        while (river.isRiver(fx, fy) && steps < 2) { fx -= dx; fy -= dy; steps++; }
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) continue;
        if (river.isRiver(fx, fy)) continue;
        if (steps !== 1) continue; // want the river exactly 1 tile wide here for a clean single-tile bridge

        return { hutX: ngx, hutY: ngy, riverX: gx, riverY: gy, farX: fx, farY: fy };
      }
    }
  }
  return null;
});
console.log("Setup:", JSON.stringify(setup));
if (!setup) { console.log("No 1-tile-wide crossing found"); await browser.close(); process.exit(1); }

const prep = await page.evaluate((s) => {
  const scene = window.__debugGame.scene.getScene("GameScene");
  const river = scene["riverManager"];
  const buildings = scene["buildingManager"];
  const deerMgr = scene["deerManager"];
  const BUILDING_TYPES = window.__BUILDING_TYPES;

  river.buildBridge(s.riverX, s.riverY);
  // clear existing deer so only ours matters
  for (const [, d] of [...deerMgr["deer"].entries()]) deerMgr.removeDeer(d);
  const deer = deerMgr.spawnDeer(s.farX, s.farY);

  const hutType = window.__debugGame.registry.get("BUILDING_HUNTER") ;
  return { bridgeBuilt: river.hasBridge(s.riverX, s.riverY), deerSpawned: !!deer, hutTypeAvailable: !!hutType };
}, setup);
console.log("Prep:", JSON.stringify(prep));

// place the hunter hut via the UI (need real building type object from the module, so click through UI)
await page.mouse.click(430, 1420);
await page.waitForTimeout(300);
await page.mouse.click(setup.hutX * 64 + 32, setup.hutY * 64 + 32);
await page.waitForTimeout(300);
await page.keyboard.press("Escape");
await page.waitForTimeout(150);
await page.mouse.move(20, 20);

let bridgeRemoved = false;
let violation = null;
const samples = [];
for (let i = 0; i < 400; i++) {
  await page.waitForTimeout(120);
  const info = await page.evaluate((s) => {
    const scene = window.__debugGame.scene.getScene("GameScene");
    const river = scene["riverManager"];
    const buildings = scene["buildingManager"];
    const building = buildings.getBuildingAt(s.hutX, s.hutY);
    if (!building) return { noHut: true };
    const w = building.slots[0].worker;
    if (!w) return { noWorker: true };
    const x = w.container.x, y = w.container.y;
    const gx = Math.floor(x / 64), gy = Math.floor(y / 64);
    const onRiverTile = river.isRiver(gx, gy);
    const bridged = river.hasBridge(s.riverX, s.riverY);
    return { x: Math.round(x), y: Math.round(y), gx, gy, state: w["state"], onRiverTile, bridged };
  }, setup);
  samples.push(info);

  if (!bridgeRemoved && info.gx === setup.riverX && info.gy === setup.riverY) {
    // worker is on the bridge tile right now — right-click it, same as a real player demolishing it
    await page.mouse.click(setup.riverX * 64 + 32, setup.riverY * 64 + 32, { button: "right" });
    bridgeRemoved = true;
    const stillBridged = await page.evaluate((s) => {
      const scene = window.__debugGame.scene.getScene("GameScene");
      return scene["riverManager"].hasBridge(s.riverX, s.riverY);
    }, setup);
    console.log("Right-clicked bridge at step", i, "while worker was at", JSON.stringify(info), "stillBridged:", stillBridged);
  }

  if (bridgeRemoved && info.onRiverTile && !info.bridged) {
    violation = { t: i, ...info };
  }
  if (violation) break;
}

console.log("Samples tail:", JSON.stringify(samples.slice(-15)));
console.log("bridgeRemoved (attempted):", bridgeRemoved);
console.log("VIOLATION:", JSON.stringify(violation));

// let the worker finish its whole errand and get back home, then confirm the bridge
// CAN be demolished once nothing is depending on it anymore
for (let i = 0; i < 200; i++) {
  await page.waitForTimeout(300);
  const idle = await page.evaluate((s) => {
    const scene = window.__debugGame.scene.getScene("GameScene");
    const building = scene["buildingManager"].getBuildingAt(s.hutX, s.hutY);
    const w = building?.slots[0]?.worker;
    return w ? w["state"] : "gone";
  }, setup);
  if (idle === "IDLE") break;
}

await page.mouse.click(setup.riverX * 64 + 32, setup.riverY * 64 + 32, { button: "right" });
await page.waitForTimeout(200);
const finalBridged = await page.evaluate((s) => {
  const scene = window.__debugGame.scene.getScene("GameScene");
  return scene["riverManager"].hasBridge(s.riverX, s.riverY);
}, setup);
console.log("Bridge demolishable once worker is home (should be false / removed):", finalBridged);

console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
