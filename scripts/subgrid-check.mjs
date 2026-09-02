import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);
await page.screenshot({ path: "./scratch/01-forest.png", clip: { x: 0, y: 0, width: 500, height: 400 } });

// try placing a forester hut on a tile that (likely) has a tree -> should be blocked (red ghost)
await page.mouse.click(180, 613); // Chatka Lesnika button
await page.waitForTimeout(150);
await page.mouse.move(150, 150); // hover over a probably-treed area
await page.waitForTimeout(200);
await page.screenshot({ path: "./scratch/02-hover-blocked.png", clip: { x: 0, y: 0, width: 500, height: 400 } });

// place it somewhere clear-ish (click multiple times looking for a valid spot won't work headless easily,
// just click and check wood count didn't change if blocked, or building appeared if allowed)
await page.mouse.click(600, 500);
await page.waitForTimeout(300);
await page.screenshot({ path: "./scratch/03-after-click.png", clip: { x: 400, y: 350, width: 400, height: 300 } });

await page.waitForTimeout(8000);
await page.screenshot({ path: "./scratch/04-after-sim.png", clip: { x: 0, y: 0, width: 900, height: 650 } });

console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
