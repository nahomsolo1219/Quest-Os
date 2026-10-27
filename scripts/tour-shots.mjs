// Dev helper: walk a guided tour and screenshot every step at 390 and 1280 px.
// Usage: node scripts/tour-shots.mjs <tourId> [login] [outDir=docs/screenshots/tour/<tourId>] [baseUrl=http://localhost:3000]
// Env: TOUR_WIDTHS=390,1280 (default both), TOUR_FROM=<1-based step to start at> (default 1).
// Resets that user's tour progress first, so the tour starts on its own like a first sign-in (or via the menu
// event when the tour is not the person's first). Prints each step id, the page and whether a target was lit.
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { mkdirSync } from "node:fs";

const LOGINS = {
  owner: "fahim@questmeals.demo", operations: "nebiyou@questmeals.demo", nutritionist: "nutritionist@questmeals.demo",
  kitchen: "kitchen@questmeals.demo", delivery: "rider@questmeals.demo", coach: "coach@questmeals.demo",
};
const [tourId, loginArg, outArg, base = "http://localhost:3000"] = process.argv.slice(2);
if (!tourId || !LOGINS[tourId]) { console.error("usage: node scripts/tour-shots.mjs <owner|operations|nutritionist|kitchen|delivery|coach> [login] [outDir]"); process.exit(1); }
let login = loginArg || LOGINS[tourId];
const out = outArg || `docs/screenshots/tour/${tourId}`;
mkdirSync(out, { recursive: true });

const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/questmeals", { max: 1 });
let [u] = await sql`select id, email from "user" where email = ${login}`;
if (!u && tourId === "coach") { login = "dagi@questmeals.demo"; [u] = await sql`select id, email from "user" where email = ${login}`; }
if (!u) { console.error("no user", login); process.exit(1); }
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
let failures = 0;
const widths = (process.env.TOUR_WIDTHS ?? "390,1280").split(",").map(Number);
const from = Math.max(1, Number(process.env.TOUR_FROM ?? 1));
for (const width of widths) {
  await sql`delete from tour_progress where user_id = ${u.id}`;
  const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
  const res = await ctx.request.post(`${base}/api/auth/sign-in/email`, { data: { email: login, password: "QuestDemo2026!" }, headers: { origin: base, "x-forwarded-for": `10.8.${width % 250}.${Math.floor(Math.random() * 250)}` } });
  if (!res.ok()) { console.error("sign-in failed", res.status()); process.exit(1); }
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror", e.message.slice(0, 200)));
  for (let attempt = 0; attempt < 3; attempt++) {
    try { await page.goto(`${base}/staff/notifications`, { waitUntil: "networkidle", timeout: 90000 }); break; }
    catch (e) { if (attempt === 2) throw e; await page.waitForTimeout(15000); }
  }
  await page.evaluate(([id, step]) => { sessionStorage.clear(); window.dispatchEvent(new CustomEvent("qm:tour-start", { detail: { tourId: id, step } })); }, [tourId, from - 1]);
  for (let i = from - 1; i < 60; i++) {
    const card = page.locator("[data-tour-card]");
    try { await card.waitFor({ state: "visible", timeout: 60000 }); } catch { console.log(`  ${width} step ${i + 1}: no card (timeout)`); failures++; break; }
    await page.waitForTimeout(700); // let the spotlight finish moving
    const id = await card.getAttribute("data-tour-step");
    const chip = await page.locator("[data-tour-chip]").innerText();
    const lit = await page.evaluate(() => !!document.querySelector("[data-tour-overlay] .ring-lime"));
    const n = String(i + 1).padStart(2, "0");
    await page.screenshot({ path: `${out}/${n}-${id}-${width}.jpg`, type: "jpeg", quality: 72 });
    console.log(`  ${width} ${chip.replace("Tour · ", "")} ${id} ${new URL(page.url()).pathname}${lit ? " [target]" : ""}`);
    const primary = page.locator("[data-tour-primary]");
    if ((await primary.innerText()).trim() === "Done") break;
    await primary.click();
    await page.waitForTimeout(150);
  }
  await ctx.close();
}
await sql.end();
await browser.close();
if (failures) process.exit(1);
