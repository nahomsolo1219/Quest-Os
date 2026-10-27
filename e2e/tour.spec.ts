// Staff guided tour (docs/STAFF_TOUR.md): first-login auto-start, skip, resume, replay from the menu, keyboard,
// and every role's tour walked to its last step ("Your week") at 390 and 1280 px.
// Global setup marks every tour skipped for every staff user (D650); each test here clears the rows of the user it
// uses first and puts the "skipped" rows back afterwards, so the other specs never meet a running tour.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { TOURS } from "../src/components/tour/tours";
import { toursFor, type TourId } from "../src/lib/tours";
import type { Role } from "../src/domain/types";
import { authFile, LOGINS, query, type RoleKey } from "./helpers";

const card = (page: Page) => page.locator("[data-tour-card]");
const chip = (page: Page) => page.locator("[data-tour-chip]");
const primary = (page: Page) => page.locator("[data-tour-primary]");
const chipText = (n: number, m: number) => new RegExp(`\\b${n} of ${m}$`);

async function userOf(key: RoleKey) {
  const [u] = await query<{ id: string; roles: Role[] }>(`select id, roles::text[] as roles from "user" where email = $1`, [LOGINS[key].who]);
  if (!u) throw new Error(`no user ${LOGINS[key].who}`);
  return u;
}
/** No saved tour progress: the person's first tour auto-starts on the next page load. */
async function clearProgress(key: RoleKey) {
  const u = await userOf(key);
  await query(`delete from tour_progress where user_id = $1`, [u.id]);
}
async function setProgress(key: RoleKey, tourId: TourId, step: number, status: "started" | "completed" | "skipped") {
  const u = await userOf(key);
  await query(
    `insert into tour_progress (user_id, tour_id, step, status) values ($1, $2, $3, $4)
     on conflict (user_id, tour_id) do update set step = excluded.step, status = excluded.status`,
    [u.id, tourId, step, status],
  );
}
/** Back to what global setup left: every tour of this person skipped. */
async function restoreSkipped(key: RoleKey) {
  const u = await userOf(key);
  for (const t of toursFor(u.roles)) await setProgress(key, t, 0, "skipped");
}
async function progressRow(key: RoleKey, tourId: TourId) {
  const u = await userOf(key);
  const [r] = await query<{ step: number; status: string }>(`select step, status from tour_progress where user_id = $1 and tour_id = $2`, [u.id, tourId]);
  return r ?? null;
}

async function readChip(page: Page): Promise<number> {
  const t = await chip(page).first().textContent({ timeout: 1000 }).catch(() => null);
  const m = t?.match(/(\d+) of (\d+)/);
  return m ? Number(m[1]) : 0;
}

/** Opens the person's tour menu: sidebar on laptops, the menu sheet on phones. */
async function openTourMenu(page: Page, info: TestInfo) {
  if (info.project.name === "phone") {
    await page.getByRole("button", { name: "Open menu" }).click();
    return page.getByRole("dialog");
  }
  return page.locator("aside");
}

function shotDir(info: TestInfo) {
  const dir = path.resolve(__dirname, "screenshots", info.project.name, "tour");
  mkdirSync(dir, { recursive: true });
  return dir;
}

type Overlap = { step: string; problem: string };

/** Card vs target: is the lit element covered by the step card or outside the viewport? */
async function checkPlacement(page: Page, target: string | undefined): Promise<string | null> {
  if (!target) return null;
  return page.evaluate((id) => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${CSS.escape(id)}"]`));
    const el = els.find((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
    const c = document.querySelector<HTMLElement>("[data-tour-card]");
    if (!el || !c) return "target or card missing";
    const t = el.getBoundingClientRect(), k = c.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    const ix = Math.max(0, Math.min(t.right, k.right) - Math.max(t.left, k.left));
    const iy = Math.max(0, Math.min(t.bottom, k.bottom) - Math.max(t.top, k.top));
    const covered = (ix * iy) / Math.max(1, t.width * t.height);
    const visH = Math.max(0, Math.min(t.bottom, vh) - Math.max(t.top, 0));
    const out: string[] = [];
    if (covered > 0.15) out.push(`card covers ${Math.round(covered * 100)}% of the target`);
    if (t.height <= vh && visH < t.height - 2) out.push(`target cut off (${Math.round(visH)} of ${Math.round(t.height)} px visible)`);
    if (t.height > vh && visH < vh * 0.5) out.push(`tall target (${Math.round(t.height)} px) mostly off screen`);
    if (k.top < 0 || k.bottom > vh + 1 || k.left < 0 || k.right > vw + 1) out.push("card outside the viewport");
    return out.length ? out.join("; ") : null;
  }, target);
}

/**
 * Clicks Next until the "Your week" step, screenshots every step into e2e/screenshots/<project>/tour/ and returns
 * the step numbers seen; steps the engine skipped (target absent) are the missing numbers.
 */
async function walkTour(page: Page, tourId: TourId, info: TestInfo, label: string = tourId) {
  const steps = TOURS[tourId].steps;
  const total = steps.length;
  const seen: number[] = [];
  const placement: Overlap[] = [];
  const dir = shotDir(info);
  await expect(card(page)).toBeVisible({ timeout: 20_000 });
  for (let guard = 0; guard <= total; guard++) {
    await expect(card(page)).toBeVisible({ timeout: 20_000 });
    const n = await readChip(page);
    expect(n, "the step chip shows a number").toBeGreaterThan(0);
    const id = await card(page).getAttribute("data-tour-step");
    expect(id, `chip ${n} of ${total} matches the step shown`).toBe(steps[n - 1].id);
    await expect(chip(page)).toHaveText(chipText(n, total));
    seen.push(n);
    await expect(primary(page), `focus on the primary button at step ${n} ${id}`).toBeFocused();
    await page.waitForTimeout(300); // spotlight transition
    const problem = await checkPlacement(page, steps[n - 1].target);
    if (problem) placement.push({ step: `${n} ${id}`, problem });
    await page.screenshot({ path: path.join(dir, `${label}-${String(n).padStart(2, "0")}-${id}.png`) });
    if (n === total) break;
    await primary(page).click();
    await expect.poll(() => readChip(page), { timeout: 45_000, intervals: [150] }).toBeGreaterThan(n);
  }
  // last step: "Your week" with Done
  await expect(card(page)).toHaveAttribute("data-tour-step", "your-week");
  await expect(card(page).getByRole("heading", { name: "Your week" })).toBeVisible();
  await expect(primary(page)).toHaveText("Done");
  await expect(card(page).getByRole("button", { name: "Skip tour" })).toHaveCount(0);
  await expect(card(page).getByRole("link").first()).toBeVisible();

  const skipped = steps.map((s, i) => ({ n: i + 1, id: s.id })).filter((s) => !seen.includes(s.n));
  const summary = `${label} (${tourId}, ${total} steps): saw ${seen.join(",")}; skipped ${skipped.length ? skipped.map((s) => `${s.n} ${s.id}`).join(", ") : "none"}`;
  const place = placement.length ? placement.map((p) => `${p.step}: ${p.problem}`).join(" | ") : "none";
  console.log(`[tour ${info.project.name}] ${summary}\n[tour ${info.project.name}] ${label} placement: ${place}`);
  info.annotations.push({ type: "tour-skipped", description: summary }, { type: "tour-placement", description: place });
  return { seen, skipped };
}

async function newPageAs(browser: Browser, key: RoleKey, info: TestInfo) {
  const u = info.project.use;
  const ctx = await browser.newContext({
    viewport: u.viewport, userAgent: u.userAgent, deviceScaleFactor: u.deviceScaleFactor, isMobile: u.isMobile, hasTouch: u.hasTouch,
    baseURL: u.baseURL, storageState: authFile(key),
  });
  return { ctx, page: await ctx.newPage() };
}

test.describe("guided tour behaviour", () => {
  test("first sign-in: the owner tour starts by itself at step 1", async ({ browser }, info) => {
    await clearProgress("fahim");
    const { ctx, page } = await newPageAs(browser, "fahim", info);
    try {
      await page.goto("/staff/dashboard");
      await expect(card(page)).toBeVisible({ timeout: 20_000 });
      await expect(card(page)).toHaveAttribute("data-tour-step", "welcome");
      await expect(chip(page)).toHaveText(chipText(1, TOURS.owner.steps.length));
      await expect(card(page).getByRole("heading", { name: "Welcome to Quest Meals, owner" })).toBeVisible();
      await expect(primary(page)).toHaveText(/Next/);
      await expect(primary(page)).toBeFocused();
      await expect(page.locator("[aria-live=polite]").filter({ hasText: "Welcome to Quest Meals, owner" })).toHaveCount(1);
      await expect.poll(() => progressRow("fahim", "owner")).toEqual({ step: 0, status: "started" });
      await page.screenshot({ path: path.join(shotDir(info), "behaviour-autostart.png") });
    } finally {
      await ctx.close();
      await restoreSkipped("fahim");
    }
  });

  test("Skip tour: saved as skipped and it does not come back on reload", async ({ browser }, info) => {
    await clearProgress("nutritionist");
    const { ctx, page } = await newPageAs(browser, "nutritionist", info);
    try {
      await page.goto("/staff");
      await expect(card(page)).toBeVisible({ timeout: 20_000 });
      await card(page).getByRole("button", { name: "Skip tour" }).click();
      await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
      await expect.poll(() => progressRow("nutritionist", "nutritionist").then((r) => r?.status)).toBe("skipped");
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForTimeout(2500);
      await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
      // another device: still no tour
      const other = await newPageAs(browser, "nutritionist", info);
      await other.page.goto("/staff");
      await expect(other.page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await other.page.waitForTimeout(2500);
      await expect(other.page.locator("[data-tour-overlay]")).toHaveCount(0);
      await other.ctx.close();
    } finally {
      await ctx.close();
      await restoreSkipped("nutritionist");
    }
  });

  test("resume: a tour left at step 3 picks up at step 3 after a reload and on another device", async ({ browser }, info) => {
    await clearProgress("rider");
    const total = TOURS.delivery.steps.length;
    const { ctx, page } = await newPageAs(browser, "rider", info);
    try {
      await page.goto("/delivery");
      await expect(chip(page)).toHaveText(chipText(1, total), { timeout: 20_000 });
      await primary(page).click();
      await expect(chip(page)).toHaveText(chipText(2, total));
      await primary(page).click();
      await expect(chip(page)).toHaveText(chipText(3, total), { timeout: 20_000 });
      await expect(card(page)).toHaveAttribute("data-tour-step", TOURS.delivery.steps[2].id);
      await expect.poll(() => progressRow("rider", "delivery")).toEqual({ step: 2, status: "started" });

      await page.reload();
      await expect(chip(page)).toHaveText(chipText(3, total), { timeout: 20_000 });
      await expect(card(page)).toHaveAttribute("data-tour-step", TOURS.delivery.steps[2].id);
      if (info.project.name === "laptop") {
        // the menu entry shows the same "n of m" while the tour runs
        await expect(page.locator('aside [data-tour="take-tour-delivery"]')).toContainText(`3 of ${total}`);
      }

      const other = await newPageAs(browser, "rider", info);
      await other.page.goto("/delivery");
      await expect(chip(other.page)).toHaveText(chipText(3, total), { timeout: 20_000 });
      await expect(card(other.page)).toHaveAttribute("data-tour-step", TOURS.delivery.steps[2].id);
      await other.page.screenshot({ path: path.join(shotDir(info), "behaviour-resume-step3.png") });
      await other.ctx.close();
    } finally {
      await ctx.close();
      await restoreSkipped("rider");
    }
  });

  test("replay: Take the tour in the menu restarts a finished tour at step 1", async ({ browser }, info) => {
    await setProgress("kitchen", "kitchen", TOURS.kitchen.steps.length - 1, "completed");
    const { ctx, page } = await newPageAs(browser, "kitchen", info);
    try {
      await page.goto("/kitchen");
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForTimeout(2000);
      await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
      const menu = await openTourMenu(page, info);
      const take = menu.getByRole("button", { name: /Take the tour/ });
      await expect(take).toBeVisible();
      await expect(take).toContainText("Done"); // finished before
      await page.screenshot({ path: path.join(shotDir(info), "behaviour-menu.png") });
      await take.click();
      await expect(card(page)).toBeVisible({ timeout: 20_000 });
      await expect(card(page)).toHaveAttribute("data-tour-step", "welcome");
      await expect(chip(page)).toHaveText(chipText(1, TOURS.kitchen.steps.length));
      if (info.project.name === "phone") await expect(page.getByRole("dialog", { name: /Meron/ })).toHaveCount(0); // sheet closed
      await expect.poll(() => progressRow("kitchen", "kitchen")).toEqual({ step: 0, status: "started" });
    } finally {
      await ctx.close();
      await restoreSkipped("kitchen");
    }
  });

  test("keyboard: arrows move, focus stays in the card, Esc closes for this session", async ({ browser }, info) => {
    await clearProgress("ops");
    const total = TOURS.operations.steps.length;
    const { ctx, page } = await newPageAs(browser, "ops", info);
    try {
      await page.goto("/staff");
      await expect(chip(page)).toHaveText(chipText(1, total), { timeout: 20_000 });
      await expect(primary(page)).toBeFocused();
      await page.keyboard.press("ArrowRight");
      await expect(chip(page)).toHaveText(chipText(2, total));
      await page.keyboard.press("ArrowLeft");
      await expect(chip(page)).toHaveText(chipText(1, total));
      await page.keyboard.press("ArrowRight");
      await expect(chip(page)).toHaveText(chipText(2, total));
      // Tab cycles inside the card
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press("Tab");
        expect(await page.evaluate(() => !!document.activeElement?.closest("[data-tour-card]")), `focus in card after ${i + 1} Tab`).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
      // paused, not skipped: the row keeps step 2
      await expect.poll(() => progressRow("ops", "operations")).toEqual({ step: 1, status: "started" });
      await page.reload();
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await page.waitForTimeout(2000);
      await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
    } finally {
      await ctx.close();
      await restoreSkipped("ops");
    }
  });
});

const WALKS: { title: string; key: RoleKey; tourId: TourId; start: string; label: string; fromMenu?: boolean }[] = [
  { title: "owner (Fahim)", key: "fahim", tourId: "owner", start: "/staff/dashboard", label: "owner" },
  { title: "operations (Nebiyou)", key: "ops", tourId: "operations", start: "/staff", label: "operations" },
  { title: "nutritionist (Hana)", key: "nutritionist", tourId: "nutritionist", start: "/staff", label: "nutritionist" },
  { title: "kitchen (Meron)", key: "kitchen", tourId: "kitchen", start: "/kitchen", label: "kitchen" },
  { title: "rider (Yonas)", key: "rider", tourId: "delivery", start: "/delivery", label: "delivery" },
  { title: "coach only (Selam)", key: "coach", tourId: "coach", start: "/app/community", label: "coach-selam" },
  { title: "coach tour from the menu (Dagi, owner + coach)", key: "owner", tourId: "coach", start: "/staff/dashboard", label: "coach-dagi", fromMenu: true },
];

test.describe("each role's tour reaches Your week", () => {
  for (const w of WALKS) {
    test(w.title, async ({ browser }, info) => {
      test.setTimeout(300_000);
      if (w.fromMenu) await setProgress(w.key, w.tourId, 0, "skipped");
      else await clearProgress(w.key);
      const { ctx, page } = await newPageAs(browser, w.key, info);
      try {
        await page.goto(w.start);
        if (w.fromMenu) {
          await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
          const menu = await openTourMenu(page, info);
          await menu.locator(`[data-tour="take-tour-${w.tourId}"]`).click();
        }
        await walkTour(page, w.tourId, info, w.label);
        await primary(page).click(); // Done
        await expect(page.locator("[data-tour-overlay]")).toHaveCount(0);
        await expect.poll(() => progressRow(w.key, w.tourId).then((r) => r?.status)).toBe("completed");
      } finally {
        await ctx.close();
        await restoreSkipped(w.key);
      }
    });
  }
});
