import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);

async function woodValue() {
  return await page.evaluate(() => {
    const el = [...document.querySelectorAll("canvas")];
    return null; // placeholder, wood is on canvas — we'll infer via screenshot instead
  });
}

// Try placing a forester hut at a grid of candidate spots until one succeeds
// (detected by the ghost being green just before the click — we just try several).
await page.mouse.click(180, 613); // Chatka Lesnika button
await page.waitForTimeout(150);

const candidates = [
  [700, 60], [750, 100], [800, 150], [700, 500], [750, 550],
  [650, 60], [850, 200], [820, 480], [780, 520], [700, 400],
];

for (const [x, y] of candidates) {
  await page.mouse.click(x, y);
  await page.waitForTimeout(150);
}

await page.screenshot({ path: "./scratch/placed-attempts.png" });
await page.waitForTimeout(9000);
await page.screenshot({ path: "./scratch/after-sim.png" });

console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
