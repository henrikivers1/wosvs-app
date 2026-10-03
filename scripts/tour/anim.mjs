// node anim.mjs <scratch> <scene> <seconds> [stills ms,ms]
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const [S, scene, seconds, stills] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`file://${new URL("./anim.html", import.meta.url).pathname}`);
await page.evaluate(() => window.ready);
const grab = (ms) => page.evaluate(([s, t]) => { window.render(s, t); return document.getElementById("c").toDataURL("image/jpeg", 0.95); }, [scene, ms]);
if (stills) {
  for (const ms of stills.split(",").map(Number)) {
    writeFileSync(`${S}/vid/still-${scene}-${ms}.jpg`, Buffer.from((await grab(ms)).split(",")[1], "base64"));
  }
} else {
  const dir = `${S}/vid/anim-${scene}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const n = Math.round(Number(seconds) * 30);
  for (let i = 0; i < n; i++) writeFileSync(`${dir}/f${String(i).padStart(4, "0")}.jpg`, Buffer.from((await grab((i * 1000) / 30)).split(",")[1], "base64"));
  console.log(scene, n, "frames");
}
await browser.close();
