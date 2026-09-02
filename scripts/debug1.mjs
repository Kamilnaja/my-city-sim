import { chromium } from "playwright";

const url = process.argv[2] || "http://localhost:5173";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 650 } });
const logs = [];
page.on("console", (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on("pageerror", (e) => logs.push(`[pageerror] ${e}`));

await page.goto(url);
await page.waitForTimeout(1000);

await page.mouse.click(180, 613); // select Chatka Lesnika
await page.waitForTimeout(150);

await page.mouse.move(700, 60);
await page.waitForTimeout(200);
await page.screenshot({ path: "./scratch/hover.png", clip: { x: 620, y: 0, width: 160, height: 160 } });

await page.mouse.click(700, 60);
await page.waitForTimeout(300);
await page.screenshot({ path: "./scratch/afterclick.png", clip: { x: 0, y: 500, width: 300, height: 150 } });

console.log(logs.join("\n"));
await browser.close();
