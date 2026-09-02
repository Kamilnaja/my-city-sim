import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(String(e)));

await page.goto(url);
await page.waitForTimeout(1000);

await page.mouse.click(180, 613); // Chatka Lesnika
await page.waitForTimeout(150);

// Systematic sweep over tile centers (64px grid) across the visible map area.
let placedAt = null;
for (let ty = 0; ty < 8 && !placedAt; ty++) {
  for (let tx = 0; tx < 12 && !placedAt; tx++) {
    const x = tx * 64 + 32;
    const y = ty * 64 + 32;
    await page.mouse.click(x, y);
    await page.waitForTimeout(30);
  }
}

await page.waitForTimeout(300);
await page.screenshot({ path: "./scratch/sweep-result.png" });
console.log("ERRORS:", JSON.stringify(errors));
await browser.close();
