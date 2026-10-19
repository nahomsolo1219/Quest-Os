// Nutritionist: intake queue, set targets, profile table (per-profile macros, edit a cell), check-ins.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";

test.use({ storageState: authFile("nutritionist") });
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test("intake queue lists clients without targets", async ({ page }, info) => {
  await page.goto("/staff/nutrition");
  await expect(page.getByRole("heading", { name: "Nutrition", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clients without targets", level: 2 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Rahel A\./ }).first()).toBeVisible();
  await screenshot(page, "nutrition-intake", info);
});

test("set targets for a client", async ({ page }, info) => {
  const [rahel] = await query<{ id: string }>("select id from clients where first_name = 'Rahel'");
  await page.goto(`/staff/nutrition/clients/${rahel.id}`);
  await page.getByRole("button", { name: "Use the calculator values" }).click();
  const kcal = info.project.name === "phone" ? "1600" : "1650";
  await page.getByLabel("Size").selectOption({ label: "S (Small)" });
  await page.getByLabel("Calories (kcal)").fill(kcal);
  await page.getByLabel("Reason or note (optional, saved in the change log)").fill("Intake consult, e2e");
  await page.getByRole("button", { name: "Save targets" }).click();
  await expect(toast(page, "Targets saved.")).toBeVisible();
  const rows = await query<{ kcal_target: number; size: string }>(
    "select kcal_target, size from nutrition_profiles where client_id = $1 and is_current", [rahel.id]);
  expect(rows).toEqual([{ kcal_target: Number(kcal), size: "S" }]);
  await screenshot(page, "nutrition-set-targets", info);
});

test("profile table shows per-profile day macros and a cell can be edited", async ({ page }, info) => {
  await page.goto("/staff/nutrition/profiles");
  const totals = page.getByRole("region", { name: "Day totals" });
  for (const p of ["S-Lean", "S-Build", "M-Lean", "M-Build", "L-Lean", "L-Build"]) await expect(totals.getByText(p, { exact: true })).toBeVisible();
  await expect(totals.getByText(/P \d+ · C \d+ · F \d+ g/).first()).toBeVisible();
  await screenshot(page, "nutrition-profile-table", info);

  const qty = info.project.name === "phone" ? "42" : "44";
  await page.getByRole("button", { name: /^Oats, S-Lean: \d+/ }).first().click();
  await page.getByLabel("Oats, S-Lean (grams)").fill(qty);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(toast(page, "Cell saved and marked manual.")).toBeVisible();
  await expect(page.getByRole("button", { name: `Oats, S-Lean: ${qty}, manual. Tap to edit` }).first()).toBeVisible();
});

test("check-ins page logs a check-in", async ({ page }, info) => {
  await page.goto("/staff/nutrition/checkins");
  await expect(page.getByRole("heading", { name: "Check-ins", level: 1 })).toBeVisible();
  await page.getByLabel("Client").selectOption({ label: "Bethlehem T." });
  await page.getByLabel("Weight (kg)").fill("76.5");
  await page.getByLabel("Adherence %").fill("90");
  await page.getByLabel("Notes").fill(`Good week (${info.project.name})`);
  await page.getByRole("button", { name: "Log check-in" }).click();
  await expect(toast(page, "Check-in saved.")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: `Good week (${info.project.name})` }).first()).toBeVisible();
  await screenshot(page, "nutrition-checkins", info);
});
