// Demo mode (docs/STAFF_TOUR.md Part B): the lime banner and the "Try a role" one-tap sign-in appear only on a
// server with DEMO_MODE=true (second web server in playwright.config.ts, same build and e2e database, port 3101);
// the normal e2e server shows neither and POST /api/jobs/demo-reset answers 404 there.
// The reset is never called with DEMO_MODE=true: it would truncate and reseed the shared e2e database.
import { test, expect } from "@playwright/test";
import { DEMO_ACCOUNTS } from "../src/lib/demo";
import { DEMO_URL } from "./env";
import { screenshot } from "./helpers";

const BANNER = "Demo copy. Practice freely: data is fake and resets every night.";

test.describe("with DEMO_MODE=true", () => {
  // one viewport is enough for the demo copy
  test.skip(({ isMobile }) => isMobile, "demo checks run once, at 1280");
  test.use({ baseURL: DEMO_URL });

  test("banner on public pages and Try a role on the login page", async ({ page }, info) => {
    await page.goto("/login");
    await expect(page.locator("[data-demo-banner]")).toHaveText(BANNER);
    const roles = page.locator("[data-demo-roles]");
    await expect(roles.getByRole("heading", { name: "Try a role" })).toBeVisible();
    await expect(roles.getByRole("button")).toHaveCount(DEMO_ACCOUNTS.length);
    for (const a of DEMO_ACCOUNTS) await expect(roles.getByRole("button", { name: new RegExp(`${a.role} · ${a.name}`) })).toBeVisible();
    // the normal sign-in form is still there
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await screenshot(page, "demo-login", info);
    for (const p of ["/", "/signup"]) {
      await page.goto(p);
      await expect(page.locator("[data-demo-banner]"), `banner on ${p}`).toHaveText(BANNER);
    }
  });

  test("one tap on Owner signs in as Fahim and lands on the owner home", async ({ page }, info) => {
    await page.goto("/login");
    await page.locator("[data-demo-roles]").getByRole("button", { name: /Owner · Fahim Mohammed/ }).click();
    await expect(page).toHaveURL(/\/staff\/dashboard$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.locator("[data-demo-banner]")).toHaveText(BANNER);
    await screenshot(page, "demo-owner-home", info);
  });
});

test.describe("without DEMO_MODE", () => {
  test("no banner and no Try a role", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await expect(page.locator("[data-demo-banner]")).toHaveCount(0);
    await expect(page.locator("[data-demo-roles]")).toHaveCount(0);
    await expect(page.getByText("Try a role")).toHaveCount(0);
    await page.goto("/");
    await expect(page.locator("[data-demo-banner]")).toHaveCount(0);
  });

  test("POST /api/jobs/demo-reset is 404, with or without the cron secret", async ({ request }) => {
    const bare = await request.post("/api/jobs/demo-reset");
    expect(bare.status()).toBe(404);
    const withSecret = await request.post("/api/jobs/demo-reset", { headers: { "x-cron-secret": "e2e-cron-secret" } });
    expect(withSecret.status()).toBe(404);
  });
});
