// Public calculator (no login) and the full self-service sign-up with a quick start.
import { expect, test } from "@playwright/test";
import { query, screenshot, testIp } from "./helpers";

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
});

test("calculator without login shows TDEE, size, macros and an indicative price", async ({ page }, info) => {
  await page.goto("/calculator");
  await page.locator("label", { hasText: "Male" }).first().click();
  await page.getByLabel("Age (years)").fill("30");
  await page.getByLabel("Weight (kg)").fill("85");
  await page.getByLabel("Height (cm)").fill("178");
  await page.getByLabel("How active are you?").selectOption("moderate");
  await page.locator("label", { hasText: "Lean" }).first().click();
  await page.getByRole("button", { name: "Calculate" }).click();
  await expect(page.getByText("You burn about")).toBeVisible();
  await expect(page.getByText("Your meal size", { exact: true })).toBeVisible();
  await expect(page.getByText("Daily macros")).toBeVisible();
  await expect(page.getByText("Indicative price")).toBeVisible();
  // prices are set for every ingredient in global setup, so a number in ETB is shown
  await expect(page.getByText(/\d[\d,]* ETB/).first()).toBeVisible();
  await expect(page.getByText("Essential plan, daily delivery, per month")).toBeVisible();
  await screenshot(page, "calculator-result", info);
});

test("full sign-up with quick start lands on payments with the quick-start invoice", async ({ page }, info) => {
  const phone = info.project.name === "phone" ? "0911200001" : "0911200002";
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Eden");
  await page.getByLabel("Last name").fill(info.project.name === "phone" ? "Phone" : "Laptop");
  await page.getByLabel("Phone number").fill(phone);
  await page.getByLabel("Password").fill("EdenPass2026!");
  await page.getByRole("button", { name: "Next" }).click();

  await page.locator("label").filter({ hasText: /^Female$/ }).click();
  await page.getByLabel("Age").fill("28");
  await page.getByLabel("Weight kg").fill("64");
  await page.getByLabel("Height cm").fill("166");
  await page.getByLabel("How active are you?").selectOption("light");
  await page.locator("label").filter({ hasText: /^Lean/ }).click();
  await expect(page.getByText(/Your size: [SML] \(/)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await page.getByLabel("Allergies").fill("peanut,");
  await page.getByRole("button", { name: "Next" }).click();

  await page.locator("label", { hasText: "Daily delivery" }).click();
  await page.getByLabel("Address").fill("Bole Medhanialem, house 12");
  await page.getByLabel("Area").selectOption({ label: "Bole" });
  await page.getByLabel("Landmark").fill("Behind the church");
  await page.getByRole("button", { name: "Next" }).click();

  await page.locator("label").filter({ hasText: /^Essential/ }).click();
  await page.locator("label").filter({ hasText: /^Weekly$/ }).click();
  await page.locator("label", { hasText: "Tomorrow" }).click();
  await expect(page.getByText(/First payment [\d,]+ ETB for \d+ service days from Wednesday, 21 October 2026/)).toBeVisible();
  await screenshot(page, "signup-plan-step", info);
  await page.getByRole("button", { name: "Create my account" }).click();

  await expect(page).toHaveURL(/\/app\/payments$/, { timeout: 20_000 });
  const qs = page.locator("article", { hasText: "Quick start" });
  await expect(qs).toBeVisible();
  await expect(qs.getByText("To pay")).toBeVisible();
  await screenshot(page, "signup-payments", info);

  const rows = await query<{ kind: string; amount_birr: number; period_start: string; service_days: number }>(
    `select i.kind, i.amount_birr, i.period_start::text, i.service_days from invoices i join clients c on c.id = i.client_id
     where c.phone = $1 and i.kind = 'quick_start'`, ["+251" + phone.slice(1)]);
  expect(rows).toHaveLength(1);
  expect(rows[0].period_start).toBe("2026-10-21");
  expect(rows[0].amount_birr % 10).toBe(0);
});

test("sign-up refuses a phone that already has an account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("First name").fill("Abel");
  await page.getByLabel("Last name").fill("Again");
  await page.getByLabel("Phone number").fill("abc");
  await page.getByLabel("Password").fill("short");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter your mobile number after +251, for example 91 123 4567.")).toBeVisible();
});
