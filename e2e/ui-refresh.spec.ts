// UI refresh (docs/UI_REFRESH.md): +251 phone field, Plan hub, menu day strip via ?day=, jobs health,
// owner Scheduled jobs card, grouped staff sidebar. Business rules are covered by the other specs.
import { expect, test } from "@playwright/test";
import { authFile, screenshot, testIp } from "./helpers";
import { CLIENT_PASSWORD } from "./env";

test.describe("public", () => {
  test.beforeEach(async ({ context }) => {
    await context.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
  });

  test("login phone field shows a fixed +251 prefix and signs in with 9XXXXXXXX", async ({ page }) => {
    await page.goto("/login");
    const phone = page.getByLabel("Phone number");
    await expect(phone).toHaveAttribute("type", "tel");
    // the prefix is a visible, separate element the field is described by
    const prefixId = await phone.getAttribute("aria-describedby");
    expect(prefixId).toBeTruthy();
    await expect(page.locator(`[id="${prefixId}"]`)).toHaveText("+251");
    await phone.fill("911000001");
    await page.getByLabel("Password").fill(CLIENT_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  });

  test("sign-up phone field shows the +251 prefix too", async ({ page }) => {
    await page.goto("/signup");
    const phone = page.getByLabel("Phone number");
    await expect(phone).toBeVisible();
    const prefixId = await phone.getAttribute("aria-describedby");
    await expect(page.locator(`[id="${prefixId}"]`)).toHaveText("+251");
  });

  test("GET /api/jobs/health lists the 8 scheduled jobs without a secret", async ({ request }) => {
    const res = await request.get("/api/jobs/health");
    expect(res.status()).toBe(200);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const body = (await res.json()) as { now: string; ok: boolean; jobs: { name: string; ok: boolean; overdue: boolean }[] };
    expect(body.now).toBe("2026-10-20T07:00:00.000Z"); // pinned e2e clock (D450)
    expect(body.jobs).toHaveLength(8);
    expect(new Set(body.jobs.map((j) => j.name)).size).toBe(8);
    expect(body.jobs.map((j) => j.name)).toEqual(expect.arrayContaining(["thursday-lock", "daily-morning", "tuesday-reminder"]));
    for (const j of body.jobs) expect(typeof j.overdue).toBe("boolean");
  });
});

test.describe("client", () => {
  test.use({ storageState: authFile("client") });

  test("Today has no loose Swaps/Pause buttons; Plan links to Swaps, Pause, Payments and Profile", async ({ page }, info) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    const main = page.getByRole("main");
    await expect(main.locator('a[href="/app/swaps"], a[href="/app/pause"]')).toHaveCount(0);
    await expect(main.locator('a[href="/app/plan"]').first()).toBeVisible();

    await page.goto("/app/plan");
    await expect(page.getByRole("heading", { name: "My plan", level: 1 })).toBeVisible();
    for (const href of ["/app/swaps", "/app/pause", "/app/payments", "/app/profile"]) {
      await expect(page.getByRole("main").locator(`a[href="${href}"]`).first()).toBeVisible();
    }
    await screenshot(page, "client-plan-hub", info);
    // each sub-page leads back to Plan, and the Plan tab stays active there
    await page.goto("/app/swaps");
    await expect(page.getByRole("link", { name: "Back to Plan" })).toBeVisible();
    await expect(page.locator('a[href="/app/plan"][aria-current="page"]')).toHaveCount(1);
  });

  test("menu day strip renders the day chosen with ?day=", async ({ page }) => {
    await page.goto("/app/menu?day=2026-10-22");
    await expect(page.getByRole("navigation", { name: "Days of the week" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Thursday, 22 October 2026 · Menu D/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Thursday, 22 October 2026/ })).toHaveAttribute("aria-current", "date");
    await expect(page.getByRole("link", { name: "Tuesday, 20 October 2026 (today)" })).toBeVisible();
    // a day outside the week falls back to today
    await page.goto("/app/menu?day=2026-11-30");
    await expect(page.getByRole("heading", { name: /Tuesday, 20 October 2026 · Menu B/ })).toBeVisible();
  });
});

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") });

  test("Dashboard shows the Scheduled jobs card with one row per job", async ({ page }) => {
    await page.goto("/staff/dashboard");
    const title = page.getByText("Scheduled jobs", { exact: true });
    await expect(title).toBeVisible();
    for (const name of ["thursday-lock", "daily-morning"]) await expect(page.getByText(name, { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "/api/jobs/health" })).toBeVisible();
  });

  test("staff sidebar shows its sections and Notifications without scrolling at 1280×720", async ({ page }, info) => {
    test.skip(info.project.name !== "laptop", "the sidebar is a menu sheet on phones");
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/staff/dashboard");
    const nav = page.getByRole("navigation", { name: "Main" }).first();
    for (const section of ["Today", "Clients & money", "Kitchen & delivery", "Community", "Admin"]) {
      await expect(nav.getByText(section, { exact: true }).first()).toBeVisible();
    }
    const notif = nav.getByRole("link", { name: /^Notifications/ });
    await expect(notif).toBeVisible();
    const box = await notif.boundingBox();
    expect(box, "Notifications link has a box").not.toBeNull();
    expect(box!.y + box!.height, "Notifications sits above the fold").toBeLessThanOrEqual(720);
    await screenshot(page, "staff-sidebar-720", info);
  });
});
