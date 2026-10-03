// Records the app scenes of the landing video from the real demo (see README.md).
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

// Frame capture straight from the compositor, one clip per scene.
const cdp = await context.newCDPSession(page);
const segments = []; let current = null; let n = 0;
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  if (!current || current.paused) return;
  const file = `${OUT}/f${String(n++).padStart(5, "0")}.jpg`;
  writeFileSync(file, Buffer.from(data, "base64"));
  current.frames.push({ file, ts: metadata.timestamp, cut: current.cutPending }); current.cutPending = false;
});
const startCast = () => cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
page.on("load", () => { startCast().catch(() => {}); });
// A scene lasts exactly `seconds`: it ends early with its last frame held.
function seg(name, seconds) { current = { name, seconds, frames: [], started: Date.now(), paused: false }; segments.push(current); }
async function endSeg() {
  const left = current.seconds * 1000 - (Date.now() - current.started);
  if (left > 0) await page.waitForTimeout(left);
  current.paused = true; current = null;
}
const wait = (ms) => page.waitForTimeout(ms);
const caption = (cap, instant) => page.evaluate(([c, i]) => window.__owCaption(c, i), [cap, Boolean(instant)]);
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

// ---- Vote
const attendance = page.locator(".overwatch-card, section, article", { hasText: "When can you play" }).last();
await scrollToEl(attendance, 110);
await caption({ k: "Automatic draw", t: "The draw lands. Overwatch finds your opponent.", s: "Every member votes when they can play: the whole battle or one half." }, true);
await wait(400);
seg("vote", 6.0);
await wait(900);
await point(page.locator("button, label").filter({ hasText: "First half" }).first()); await wait(800);
await point(page.locator("button, label").filter({ hasText: "Whole battle" }).first());
await endSeg();

// ---- Automatic imports: opponent intel, then your own imported stats
await caption({ k: "Automatic imports", t: "Opponent intel imports itself.", s: "Their top alliances, strongest players and power, next to your own state." }, true);
await wait(400);
seg("intel", 9.0);
await wait(400);
await point(page.locator("a.main-nav-link", { hasText: "Intel" }));
await page.waitForURL("**/state/intel"); await wait(1500);
const players = page.locator("section", { hasText: "Their strongest players" }).first();
await scrollToEl(players, 120); await wait(700);
await caption({ k: "Automatic imports", t: "So do your own stats.", s: "Power, Furnace, Labyrinth score and alliance from WOSOracle, refreshed every Monday." });
await point(page.locator(".profile-menu summary, .header-profile summary, summary:has(.profile-avatar)").first());
await wait(300);
await point(page.locator(".profile-dropdown a", { hasText: "Account" }).first());
await page.waitForURL("**/account"); await wait(900);
const grid = page.locator(".player-data-grid").first();
if (await grid.count()) { await scrollToEl(grid, 260); await grid.evaluate((el) => el.classList.add("ow-spot")); }
await endSeg();
// ---- Plan builds itself
seg("plan", 9.0);
await caption({ k: "Automation", t: "24 hours before, the plan builds itself.", s: "The garrison first, then every rally, from who can play." });
await point(page.locator("a.main-nav-link", { hasText: "Planning" }));
await page.waitForURL("**/state/planning"); await wait(900);
await point(page.getByRole("button", { name: "Generate now" })); await wait(1200);
await caption({ k: "Garrison and rallies", t: "Strongest defenders hold the castle.", s: "Rally leads swap every pet block, and nobody leads and joins at once." });
const board = page.locator(".rally-board, .planning-board, [class*='rally-column']").first();
if (await board.count()) await scrollToEl(board, 120); else await scrollTo(900);
await endSeg();

// ---- Publish (setup off camera: back to the top)
await scrollTo(0);
await caption({ k: "Automation", t: "6 hours before, everyone gets their orders.", s: "Their rally, hero and formation, and when their lead swaps." }, true);
seg("publish", 6.5);
await point(page.getByRole("button", { name: "Publish now" })); await wait(900);
await point(page.locator("a.main-nav-link", { hasText: "Overwatch" }));
await page.waitForURL("**/state/overwatch"); await wait(900);
const yours = page.locator(".overwatch-card", { hasText: "Your assignment" }).first();
if (await yours.count()) { await scrollToEl(yours, 150); await yours.evaluate((el) => el.classList.add("ow-spot")); }
await endSeg();

// ---- Off camera: start the battle and add two enemy leaders
await caption(null, true);
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
await caption({ k: "Live battle", t: "Coordinators call the enemy rallies they see.", s: "Pick the leader, type the in-game rally timer, press Call." }, true);
await wait(500);

// ---- Coordinators call two rallies
seg("call", 7.5);
const leader = page.getByLabel("Rally leader");
await point(leader, { click: false }); await leader.selectOption({ label: "Inferno" }); await wait(300);
await type(page.getByLabel("Rally minutes remaining"), "0");
await type(page.getByLabel("Rally seconds remaining"), "25");
await point(page.getByRole("button", { name: "Call rally" })); await wait(500);
await point(leader, { click: false }); await leader.selectOption({ label: "Ember" }); await wait(300);
await type(page.getByLabel("Rally seconds remaining"), "35");
await point(page.getByRole("button", { name: "Call rally" }));
await endSeg();

// ---- Garrison countdown: it starts so SEND NOW comes about 8 s into the scene
const firstStatus = page.locator(".send-status").first();
const msLeft = async (loc) => { const m = (await loc.innerText()).match(/([\d.]+) seconds/); return m ? Number(m[1]) * 1000 : 0; };
const left = await msLeft(firstStatus);
console.log("countdown after calls:", left);
if (left > 8300) await wait(left - 8300);
await caption({ k: "Garrison", t: "Every garrison player gets their own countdown.", s: "From their own march time, on one shared clock." }, true);
seg("garrison", 9.5);
await point(page.locator(".state-section-nav a, nav a", { hasText: "Garrison" }).last());
await page.waitForURL("**/garrison"); await wait(300);
const windowCard = page.locator("article", { hasText: "Window 1" }).first();
await scrollToEl(windowCard, 230);
await windowCard.evaluate((el) => el.classList.add("ow-spot"));
await page.evaluate(() => window.__owCursor(1150, 700));
await windowCard.locator(".send-status.send-now").waitFor({ timeout: 30000 });
await caption({ k: "Garrison", t: "Send now.", s: "Land in the gap between Ember and Inferno." }, true);
await wait(500); await shot("6-sendnow");
await endSeg();

// ---- Victory
await caption(null, true);
await page.evaluate(() => [...document.querySelectorAll(".demo-banner button")].find((b) => b.textContent.includes("win"))?.click());
await page.waitForLoadState("load"); await wait(1500);
await page.goto(base + "/notifications"); await wait(2000);
await page.evaluate(() => window.scrollTo(0, 0));
await caption({ k: "After the battle", t: "Victory or Defeat, for everyone.", s: "Results come from WOSOracle and go into your state's history." }, true);
const victory = page.locator(".notification-card", { hasText: "Victory" }).first();
if (await victory.count()) await victory.evaluate((el) => el.classList.add("ow-spot"));
await wait(300);
seg("victory", 3.5);
await endSeg();
await cdp.send("Page.stopScreencast").catch(() => {});

// One ffmpeg list per scene; each lasts exactly its planned length.
for (const segment of segments) {
  const f = segment.frames;
  let list = ""; let used = 0;
  for (let i = 0; i < f.length; i++) {
    const next = f[i + 1];
    let d = next ? (next.cut ? 1 / 30 : next.ts - f[i].ts) : Math.max(1 / 30, segment.seconds - used);
    d = Math.max(d, 1 / 120);
    used += d;
    list += `file '${f[i].file}'\nduration ${d.toFixed(4)}\n`;
  }
  list += `file '${f.at(-1).file}'\n`;
  writeFileSync(`${S}/vid/seg-${segment.name}.txt`, list);
  console.log(segment.name, f.length, "frames", used.toFixed(2), "s");
}
console.log("errors:", errors.join(" | ") || "none");
await browser.close();
