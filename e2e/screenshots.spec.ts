// Every route of PLAN.md section 5 as the right role, at both widths: full-page screenshot + no horizontal overflow.
import { expect, test } from "@playwright/test";
import { authFile, expectNoHorizontalOverflow, query, screenshot, type RoleKey } from "./helpers";

const D = "2026-10-20";
const ROUTES: [RoleKey | "anon", string][] = [
  ["anon", "/"], ["anon", "/calculator"], ["anon", "/signup"], ["anon", "/login"], ["anon", "/offline"],
  ["ops", "/staff"], ["ops", "/staff/clients"], ["ops", "/staff/clients/new"], ["ops", "/staff/clients/{client}"],
  ["ops", "/staff/clients/{lead}/onboard"], ["ops", "/staff/payments"], ["ops", "/staff/orders"], ["ops", "/staff/quick-starts"],
  ["ops", "/staff/purchasing"], ["ops", "/staff/delivery"], ["ops", "/staff/community"], ["ops", "/staff/notifications"],
  ["nutritionist", "/staff/nutrition"], ["nutritionist", "/staff/nutrition/profiles"], ["nutritionist", "/staff/nutrition/swaps"],
  ["nutritionist", "/staff/nutrition/checkins"], ["nutritionist", "/staff/nutrition/clients/{client}"],
  ["owner", "/staff/dashboard"], ["owner", "/staff/partners"], ["owner", "/staff/settings/pricing"], ["owner", "/staff/settings/packages"],
  ["owner", "/staff/settings/nutrition"], ["owner", "/staff/settings/schedule"], ["owner", "/staff/settings/swaps"],
  ["owner", "/staff/settings/areas"], ["owner", "/staff/settings/ingredients"], ["owner", "/staff/settings/changes"],
  ["kitchen", "/kitchen"], ["kitchen", `/kitchen/production/${D}`], ["kitchen", `/kitchen/recipes/${D}`], ["kitchen", `/kitchen/packing/${D}`],
  ["kitchen", `/kitchen/labels/${D}`], ["kitchen", "/kitchen/stock"], ["kitchen", "/kitchen/waste"],
  ["rider", "/delivery"], ["rider", "/delivery/pickup"],
  ["client", "/app"], ["client", "/app/menu"], ["client", "/app/plan"], ["client", "/app/swaps"], ["client", "/app/pause"],
  ["client", "/app/payments"], ["client", "/app/progress"], ["client", "/app/profile"], ["client", "/app/community"],
  ["client", "/app/community/{post}"], ["client", "/app/community/challenges"], ["client", "/app/community/challenges/{challenge}"],
  ["client", "/app/community/new"], ["client", "/app/notifications"],
];

async function resolve(path: string) {
  const one = async (sql: string) => (await query<{ id: string }>(sql))[0].id;
  if (path.includes("{client}")) path = path.replace("{client}", await one("select id from clients where first_name = 'Abel'"));
  if (path.includes("{lead}")) path = path.replace("{lead}", await one("select id from clients where first_name = 'Rahel'"));
  if (path.includes("{post}")) path = path.replace("{post}", await one("select id from community_posts where pinned order by created_at limit 1"));
  if (path.includes("{challenge}")) path = path.replace("{challenge}", await one("select id from challenges order by created_at limit 1"));
  return path;
}
const slug = (p: string) => (p === "/" ? "home" : p.slice(1).replace(/\{|\}/g, "").replace(/[/]/g, "-"));

for (const [role, route] of ROUTES) {
  test.describe(`${role}`, () => {
    test.use({ storageState: role === "anon" ? { cookies: [], origins: [] } : authFile(role) });
    test(`screen ${route}`, async ({ page }, info) => {
      const res = await page.goto(await resolve(route));
      expect(res?.status(), route).toBeLessThan(400);
      await page.waitForLoadState("networkidle");
      // the page stayed where we sent it (no role redirect)
      expect(new URL(page.url()).pathname.split("/")[1]).toBe((await resolve(route)).split("/")[1]);
      await expect(page.locator("main").first()).toBeVisible();
      if ((await page.locator("h1").count()) === 0) info.annotations.push({ type: "missing-h1", description: route });
      await screenshot(page, `route-${slug(route)}`, info);
      await expectNoHorizontalOverflow(page);
    });
  });
}
