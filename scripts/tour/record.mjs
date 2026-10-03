// Records the landing video (public/video/overwatch-tour.*) from the real demo.
// Needs a production build running on :3125 and Playwright with Chromium:
//   node scripts/tour/record.mjs <work dir> [debug]
//   scripts/tour/encode.sh <work dir>/vid public/video
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const S = process.argv[2];
const DEBUG = process.argv[3] === "debug";
const OUT = `${S}/vid/frames`;
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const base = "http://localhost:3125";

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const page = await context.newPage();
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("dialog", (d) => d.accept());

// Overlay: captions, cards and a cursor, kept across reloads via sessionStorage.
await context.addInitScript(() => {
  const css = `
    .demo-banner { display: none !important; }
    ::-webkit-scrollbar { display: none; }
    html { scrollbar-width: none; }
    #ow-cap { position: fixed; left: 40px; bottom: 34px; z-index: 2147483000; max-width: 720px;
      padding: 16px 22px 18px; border-radius: 14px; background: rgba(8, 21, 36, 0.94);
      border: 1px solid #2b4c6e; box-shadow: 0 18px 50px rgba(0,0,0,.45);
      transition: opacity .35s ease, transform .35s ease; font-family: var(--font-display), Archivo, sans-serif; }
    #ow-cap.hidden { opacity: 0; transform: translateY(14px); }
    #ow-cap .k { font-family: var(--font-mono), monospace; font-size: 12px; letter-spacing: .16em; text-transform: uppercase; color: #f8d48c; }
    #ow-cap .t { margin-top: 6px; font-size: 27px; line-height: 1.15; font-weight: 700; color: #eaf4fb; }
    #ow-cap .s { margin-top: 6px; font-family: var(--font-body), Archivo, sans-serif; font-size: 16px; line-height: 1.4; color: #c2d7e7; }
    #ow-card { position: fixed; inset: 0; z-index: 2147483100; display: grid; place-items: center; text-align: center;
      background: radial-gradient(ellipse at 50% 35%, #163352 0%, #0b1d31 60%, #081524 100%);
      transition: opacity .6s ease; font-family: var(--font-display), Archivo, sans-serif; }
    #ow-card.hidden { opacity: 0; pointer-events: none; }
    #ow-card img { width: 96px; height: 96px; }
    #ow-card h1 { margin: 14px 0 0; font-size: 64px; font-weight: 800; letter-spacing: -0.01em; color: #eaf4fb; }
    #ow-card p { margin: 10px 0 0; font-size: 24px; color: #c2d7e7; }
    #ow-card .cta { display: inline-block; margin-top: 26px; padding: 14px 26px; border-radius: 12px; background: #f2b33d; color: #0b1d31; font-weight: 700; font-size: 22px; }
    #ow-card .url { margin-top: 14px; font-family: var(--font-mono), monospace; font-size: 18px; color: #8ec4e6; letter-spacing: .04em; }
    #ow-cursor { position: fixed; z-index: 2147483200; width: 26px; height: 26px; pointer-events: none;
      transition: left .55s cubic-bezier(.3,.7,.3,1), top .55s cubic-bezier(.3,.7,.3,1); filter: drop-shadow(0 2px 4px rgba(0,0,0,.5)); }
    #ow-cursor.press::after { content: ""; position: absolute; left: -10px; top: -10px; width: 26px; height: 26px; border-radius: 50%;
      border: 2px solid #f2b33d; animation: ow-ring .45s ease-out forwards; }
    @keyframes ow-ring { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.6); opacity: 0; } }
    .ow-spot { outline: 3px solid #f2b33d !important; outline-offset: 6px; border-radius: 10px; transition: outline-color .3s; }
  `;
  const mount = () => {
    if (document.getElementById("ow-cap")) return;
    const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
    const cap = document.createElement("div"); cap.id = "ow-cap"; cap.className = "hidden";
    cap.innerHTML = '<div class="k"></div><div class="t"></div><div class="s"></div>';
    const card = document.createElement("div"); card.id = "ow-card"; card.className = "hidden";
    const cur = document.createElement("div"); cur.id = "ow-cursor";
    cur.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2 L4 19 L8.5 15 L11.5 22 L14.5 20.7 L11.6 14 L18 14 Z" fill="#ffffff" stroke="#0b1d31" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.append(cap, card, cur);
    const state = JSON.parse(sessionStorage.getItem("ow-video") || "{}");
    window.__owCaption(state.cap || null, true);
    window.__owCard(state.card || null, true);
    const pos = state.cursor || [1100, 620];
    cur.style.left = pos[0] + "px"; cur.style.top = pos[1] + "px";
  };
  const save = (patch) => {
    const state = JSON.parse(sessionStorage.getItem("ow-video") || "{}");
    sessionStorage.setItem("ow-video", JSON.stringify({ ...state, ...patch }));
  };
  window.__owCaption = (cap, instant) => {
    const el = document.getElementById("ow-cap"); if (!el) return; save({ cap });
    if (!cap) { el.className = "hidden"; return; }
    const apply = () => {
      el.querySelector(".k").textContent = cap.k || ""; el.querySelector(".t").textContent = cap.t || "";
      el.querySelector(".s").textContent = cap.s || ""; el.className = "";
    };
    if (instant || el.className === "hidden") apply();
    else { el.className = "hidden"; setTimeout(apply, 350); }
  };
  window.__owCard = (card, instant) => {
    const el = document.getElementById("ow-card"); if (!el) return; save({ card });
    if (!card) { el.className = "hidden"; return; }
    el.innerHTML = `<div><img src="/brand/overwatch-mark-on-dark.svg" alt=""><h1>${card.t}</h1><p>${card.s || ""}</p>${card.cta ? `<div class="cta">${card.cta}</div>` : ""}${card.url ? `<div class="url">${card.url}</div>` : ""}</div>`;
    if (instant) { el.style.transition = "none"; el.className = ""; void el.offsetWidth; el.style.transition = ""; } else el.className = "";
  };
  window.__owCursor = (x, y) => { const el = document.getElementById("ow-cursor"); if (!el) return; el.style.left = x + "px"; el.style.top = y + "px"; save({ cursor: [x, y] }); };
  window.__owPress = () => { const el = document.getElementById("ow-cursor"); el.classList.remove("press"); void el.offsetWidth; el.classList.add("press"); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
});

// Frame capture straight from the compositor.
const cdp = await context.newCDPSession(page);
const frames = []; let recording = false; let cutPending = false; let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (!recording) return;
  const file = `${OUT}/f${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  frames.push({ file, ts: metadata.timestamp, cut: cutPending }); cutPending = false;
});
const startCast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
page.on("load", () => { startCast().catch(() => {}); });
const rec = () => { recording = true; };
const cut = () => { recording = false; cutPending = true; };
// Freezes the last captured frame for a while (the cut after it removes the real wait).
const hold = (seconds) => { if (frames.length) frames.at(-1).hold = seconds; };

const wait = (ms) => page.waitForTimeout(ms);
const caption = (cap, instant) => page.evaluate(([c, i]) => window.__owCaption(c, i), [cap, Boolean(instant)]);
const card = (c) => page.evaluate((x) => window.__owCard(x), c);
const shot = async (name) => { if (DEBUG) await page.screenshot({ path: `${S}/vid/r-${name}.png` }); };
async function point(locator, { click = true, dx = 0.5, dy = 0.5 } = {}) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  const x = box.x + box.width * dx, y = box.y + box.height * dy;
  await page.evaluate(([x, y]) => window.__owCursor(x, y), [x, y]);
  await wait(650);
  if (click) { await page.evaluate(() => window.__owPress()); await locator.click(); }
}
async function scrollTo(y) { await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), y); await wait(900); }
async function scrollToEl(locator, offset = 140) {
  const top = await locator.evaluate((el, off) => el.getBoundingClientRect().top + window.scrollY - off, offset);
  await scrollTo(top);
}
async function type(locator, text) { await point(locator); await locator.press("Control+a"); await locator.pressSequentially(text, { delay: 120 }); }

// ---- Setup (not recorded): demo with the leaders' votes, signed in as the owner.
await page.goto(base + "/login");
await page.getByRole("button", { name: "Try the private demo" }).click();
await page.waitForURL("**/state/overwatch"); await wait(2500);
await startCast();

// ---- 1. Title card
await card({ t: "Overwatch", s: "Whiteout Survival SvS, planned and timed for your whole state." });
await wait(400); rec(); await wait(3200);
await card(null); await wait(700);

// ---- 2. The draw and the vote
await caption({ k: "Automatic draw", t: "The draw lands. Overwatch finds your opponent.", s: "Every member votes when they can play: the whole battle or one half." });
const attendance = page.locator(".overwatch-card, section, article", { hasText: "When can you play" }).last();
await scrollToEl(attendance, 110);
await wait(600);
const firstHalf = page.locator("button, label").filter({ hasText: "First half" }).first();
await point(firstHalf); await wait(900);
const whole = page.locator("button, label").filter({ hasText: "Whole battle" }).first();
await point(whole); await wait(1600); await shot("2-vote");

// ---- 3. Rallies build themselves
await caption({ k: "Automation", t: "24 hours before, the plan builds itself.", s: "The garrison first, then every rally, from who can play." });
await point(page.locator("a.main-nav-link", { hasText: "Planning" }));
await page.waitForURL("**/state/planning"); await wait(1500);
await point(page.getByRole("button", { name: "Generate now" })); await wait(1800);
await caption({ k: "Garrison and rallies", t: "Strongest defenders hold the castle.", s: "Rally leads swap every pet block, and nobody leads and joins at once." });
const board = page.locator(".rally-board, .planning-board, [class*='rally-column']").first();
if (await board.count()) await scrollToEl(board, 120); else await scrollTo(900);
await wait(2600); await shot("3-board");
await scrollTo(0); await wait(400);

// ---- 4. Publish
await caption({ k: "Automation", t: "6 hours before, everyone gets their orders.", s: "Their rally, hero and formation, and when their lead swaps." });
await point(page.getByRole("button", { name: "Publish now" })); await wait(1400);
await point(page.locator("a.main-nav-link", { hasText: "Overwatch" }));
await page.waitForURL("**/state/overwatch"); await wait(1200);
const yours = page.locator(".overwatch-card", { hasText: "Your assignment" }).first();
if (await yours.count()) { await scrollToEl(yours, 150); await yours.evaluate((el) => el.classList.add("ow-spot")); }
await wait(2600); await shot("4-assignment");

// ---- (cut) Start the battle and add two enemy leaders
cut();
await caption(null);
await page.evaluate(() => [...document.querySelectorAll(".demo-banner button")].find((b) => b.textContent.includes("Start the battle"))?.click());
await page.waitForLoadState("load"); await wait(2500);
await page.goto(base + "/admin/leaders"); await wait(2000);
for (const [i, xy] of [[0, [612, 588]], [1, [596, 611]]]) {
  await page.getByRole("button", { name: "Use" }).nth(i).click(); await wait(300);
  await page.getByLabel("X coordinate").first().fill(String(xy[0]));
  await page.getByLabel("Y coordinate").first().fill(String(xy[1]));
  await page.getByRole("button", { name: "Add leader" }).click(); await wait(600);
}
await page.goto(base + "/admin/call-rally"); await wait(2000);
await page.evaluate(() => window.scrollTo(0, 0));
await page.evaluate(() => window.__owCursor(1000, 600));

// ---- 5. Coordinators call enemy rallies
await caption({ k: "Live battle", t: "Coordinators call the enemy rallies they see.", s: "Pick the leader, type the in-game rally timer, press Call." });
rec(); await wait(1500);
const leader = page.getByLabel("Rally leader");
await point(leader, { click: false }); await leader.selectOption({ label: "Inferno" }); await wait(500);
await type(page.getByLabel("Rally minutes remaining"), "0");
await type(page.getByLabel("Rally seconds remaining"), "25");
await point(page.getByRole("button", { name: "Call rally" })); await wait(900);
await point(leader, { click: false }); await leader.selectOption({ label: "Ember" }); await wait(400);
await type(page.getByLabel("Rally seconds remaining"), "35");
await point(page.getByRole("button", { name: "Call rally" })); await wait(1300); await shot("5-called");

// ---- 6. The garrison countdown (the hero moment)
// Skip the wait so the countdown starts at about 13 s when the page opens.
const firstStatus = page.locator(".send-status").first();
const msLeft = async (loc) => {
  const m = (await loc.innerText()).match(/([\d.]+) seconds/); return m ? Number(m[1]) * 1000 : 0;
};
let left = await msLeft(firstStatus);
console.log("countdown after calls:", left);
if (left > 14500) { cut(); await wait(left - 14500); rec(); }
await caption({ k: "Garrison", t: "Every garrison player gets their own countdown.", s: "Their reinforcements land in the gap between two enemy rallies." });
await point(page.locator(".state-section-nav a, nav a", { hasText: "Garrison" }).last());
await page.waitForURL("**/garrison"); await wait(500);
const windowCard = page.locator("article", { hasText: "Window 1" }).first();
await scrollToEl(windowCard, 230);
await windowCard.evaluate((el) => el.classList.add("ow-spot"));
await page.evaluate(() => window.__owCursor(1150, 700));
await wait(3800);
await caption({ k: "Garrison", t: "Timed to the second, on one shared clock.", s: "March time from your city, ping compensation, sound and phone alerts." });
await windowCard.locator(".send-status.send-now").waitFor({ timeout: 30000 });
await caption({ k: "Garrison", t: "Send now.", s: "Reinforcements land between Ember and Inferno, never into a rally." }, true);
await wait(700); await shot("6-sendnow");
hold(2.2); cut();

// ---- 7. Result
cut();
await caption(null);
await page.evaluate(() => [...document.querySelectorAll(".demo-banner button")].find((b) => b.textContent.includes("win"))?.click());
await page.waitForLoadState("load"); await wait(1500);
await page.goto(base + "/notifications"); await wait(2000);
await page.evaluate(() => window.scrollTo(0, 0));
await caption({ k: "After the battle", t: "Victory or Defeat, for everyone.", s: "Results come from WOSOracle and go into your state's history." });
const victory = page.locator(".notification-card", { hasText: "Victory" }).first();
if (await victory.count()) await victory.evaluate((el) => el.classList.add("ow-spot"));
rec(); await wait(3600); await shot("7-victory");

// ---- 8. End card
await caption(null);
await card({ t: "Overwatch", s: "Free to try. No account needed.", cta: "Try the free demo", url: "wosoverwatch.com" });
await wait(4200);
recording = false;
await cdp.send("Page.stopScreencast").catch(() => {});

// Frame list for ffmpeg: real durations, cuts shortened to one frame.
let list = "";
for (let i = 0; i < frames.length; i++) {
  const next = frames[i + 1];
  let d = next ? next.ts - frames[i].ts : 0.5;
  if (next?.cut) d = 1 / 30;
  if (frames[i].hold) d = frames[i].hold;
  d = Math.min(Math.max(d, 1 / 60), 4);
  list += `file '${frames[i].file}'\nduration ${d.toFixed(4)}\n`;
}
list += `file '${frames.at(-1).file}'\n`;
writeFileSync(`${S}/vid/frames.txt`, list);
const total = frames.reduce((sum, f, i) => { const nx = frames[i + 1]; return sum + (f.hold ? f.hold : nx ? (nx.cut ? 1 / 30 : nx.ts - f.ts) : 0.5); }, 0);
console.log("frames:", frames.length, "seconds:", total.toFixed(1));
console.log("errors:", errors.join(" | ") || "none");
await browser.close();
