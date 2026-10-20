// Records the app scenes of the Frostdragon Tyrant guide from the real demo (see README.md).
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const S = process.argv[2];
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

// Scene lengths follow the narration: 0.25 s + half the incoming transition
// + the line + about a second + the outgoing transition (compose.py ORDER).
const LEN = { create: 10.5, vote: 7.5, lineup: 9.4, assign: 10.1, notes: 10.6, publish: 9.2, member: 5.3 };
const DEMO_DATA = "wosoverwatch-demo-data-v10";
// Edits the demo's data off camera, then reloads so the pages see it.
async function editDemo(fn, arg) {
  await page.evaluate(([key, source, value]) => {
    const tables = JSON.parse(localStorage.getItem(key));
    new Function("tables", "value", source)(tables, value);
    localStorage.setItem(key, JSON.stringify(tables));
  }, [DEMO_DATA, `(${fn})(tables, value)`, arg]);
  await page.reload(); await wait(1500);
}

// ---- Setup (not recorded): the demo, signed in as the owner, on FDT planning.
await page.goto(base + "/login");
await page.getByRole("button", { name: "Try the private demo" }).click();
await page.waitForURL("**/state/overwatch"); await wait(2000);
await page.goto(base + "/state/planning/fdt"); await wait(1800);
await page.evaluate(() => window.__owCursor(1000, 560));
await startCast();

// ---- Create the event
const battleDay = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
await caption({ k: "Planning → Frostdragon Tyrant", t: "Create the event.", s: "Its start time in UTC. Every member is asked to vote." }, true);
seg("create", LEN.create);
await wait(600);
await point(page.locator("a.nav-link", { hasText: "Frostdragon Tyrant" }), { click: false }); await wait(500);
const timeInput = page.locator('input[type="datetime-local"]').first();
await point(timeInput); await timeInput.fill(`${battleDay}T12:00`); await wait(900);
await point(page.getByRole("button", { name: "Create FDT event" })); await wait(1200);
const sent = page.locator(".page-message").first();
if (await sent.count()) await sent.evaluate((el) => el.classList.add("ow-spot"));
await wait(800);
await endSeg();

// ---- Off camera: the rest of the state votes.
await caption(null, true);
await editDemo((tables) => {
  const event = tables.fdt_events.at(-1);
  const own = new Set(tables.wos_accounts.filter((a) => a.user_id === "00000000-0000-4000-8000-00000000d3e0").map((a) => a.id));
  const members = tables.state_members.filter((m) => m.state_id === event.state_id && !own.has(m.wos_account_id));
  members.forEach((m, i) => {
    const availability = i % 9 === 4 ? "no" : i % 7 === 3 ? "maybe" : i % 11 === 10 ? null : "yes";
    if (!availability) return;
    (tables.fdt_votes ??= []).push({ event_id: event.id, state_id: event.state_id, wos_account_id: m.wos_account_id, availability, voice_call: i % 3 === 0, updated_at: new Date().toISOString() });
  });
});
await page.goto(base + "/state/overwatch"); await wait(1800);
const card = page.locator(".fdt-vote").first();
await scrollToEl(card, 120);
await page.evaluate(() => window.__owCursor(1000, 600));

// ---- Members vote
await caption({ k: "Overwatch", t: "Members vote.", s: "I can play, Maybe or Can't play, and voice call." }, true);
seg("vote", LEN.vote);
await wait(700);
await point(card.getByRole("button", { name: /I can play/ })); await wait(900);
await point(card.locator("label", { hasText: "I can join voice call" }).locator("input")); await wait(600);
await endSeg();

// ---- Off camera: back to planning.
await caption(null, true);
await page.goto(base + "/state/planning/fdt"); await wait(1800);
const lineup = page.locator("section", { hasText: "Alliances and targets" }).first();
await scrollToEl(lineup, 90);
await page.evaluate(() => window.__owCursor(1000, 600));

// ---- Fill the alliances from the votes
await caption({ k: "Lineup", t: "Everyone who said yes, in one tap.", s: "Into their own alliance, strongest first, never over 60." }, true);
seg("lineup", LEN.lineup);
await wait(900);
await point(page.getByRole("button", { name: "Add everyone who said yes to their alliance" })); await wait(1500);
const summary = page.locator(".fdt-alliance-summary").first();
await summary.evaluate((el) => el.classList.add("ow-spot")); await wait(400);
await point(summary, { click: false, dx: 0.3, dy: 0.6 });
await endSeg();

// ---- Off camera: most targets set, the strongest four left to set on camera.
await caption(null, true);
await editDemo((tables) => {
  const event = tables.fdt_events.at(-1);
  const power = (id) => tables.wos_accounts.find((a) => a.id === id)?.power ?? 0;
  const spots = (tables.fdt_assignments ?? []).filter((a) => a.event_id === event.id).sort((a, b) => power(b.wos_account_id) - power(a.wos_account_id));
  spots.forEach((spot, i) => { if (i >= 4) spot.target = i % 3 === 0 ? "spires" : "capital"; });
});
await page.getByRole("button", { name: /^In lineup/ }).click(); await wait(600);
const table = page.locator(".fdt-table").first();
await scrollToEl(table, 170);
await page.evaluate(() => window.__owCursor(1100, 620));

// ---- Targets
await caption({ k: "Lineup", t: "Give each player a target.", s: "The Capital or the Spires. Every alliance shows its count." }, true);
seg("assign", LEN.assign);
await wait(600);
const rows = table.locator("tbody tr");
for (const [i, target] of [[0, "capital"], [1, "capital"], [2, "spires"], [3, "capital"]]) {
  const select = rows.nth(i).locator("select").nth(1);
  await point(select, { click: false }); await page.evaluate(() => window.__owPress());
  await select.selectOption(target); await wait(450);
}
await scrollToEl(page.locator(".fdt-alliance-summary").first(), 120);
await page.locator(".fdt-alliance-summary").first().evaluate((el) => el.classList.add("ow-spot"));
await endSeg();

// ---- Rally notes
await caption(null, true);
await page.locator(".fdt-alliance-summary").first().evaluate((el) => el.classList.remove("ow-spot"));
const notes = page.locator("section", { hasText: "What each target should know" }).first();
await scrollToEl(notes, 90);
await caption({ k: "Rally notes", t: "One note per target.", s: "Like which 4 joiner heroes to send first. No fixed joiner lists." }, true);
seg("notes", LEN.notes);
await wait(500);
const [capitalBox, spiresBox] = [notes.locator("textarea").nth(0), notes.locator("textarea").nth(1)];
await point(capitalBox); await capitalBox.pressSequentially("Join with Jessie, Jasser, Seo-yoon and Hector first.", { delay: 38 });
await wait(300);
await point(spiresBox); await spiresBox.pressSequentially("Join with Lynn, Jeronimo, Molly and Natalia first.", { delay: 38 });
await wait(300);
await point(notes.getByRole("button", { name: "Save notes" }));
await endSeg();

// ---- Publish, and what the player gets
await caption(null, true);
await scrollTo(0);
await page.evaluate(() => window.__owCursor(1000, 560));
await caption({ k: "Publish", t: "Everyone gets their spot.", s: "Alliance, target and rally note. Later changes reach that player at once." }, true);
seg("publish", LEN.publish);
await wait(600);
await point(page.getByRole("button", { name: "Publish lineup" })); await wait(1300);
await point(page.locator('a[href="/notifications"]').first());
await page.waitForURL("**/notifications"); await wait(1000);
const notice = page.locator("article, li, .notification-card", { hasText: "Your Frostdragon Tyrant spot" }).first();
if (await notice.count()) { await scrollToEl(notice, 200); await notice.evaluate((el) => el.classList.add("ow-spot")); }
await endSeg();

// ---- The player's view
await caption(null, true);
await page.goto(base + "/state/overwatch"); await wait(1800);
const spot = page.locator(".fdt-vote").first();
await scrollToEl(spot, 120);
await spot.locator(".fdt-spot").evaluate((el) => el.classList.add("ow-spot"));
await page.evaluate(() => window.__owCursor(1150, 650));
await caption({ k: "Overwatch", t: "Every player knows where to go.", s: "Their alliance, their target, their heroes." }, true);
seg("member", LEN.member);
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
