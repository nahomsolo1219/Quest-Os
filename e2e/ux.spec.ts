// UX rules: lists with no data show an empty state that says what to do next; failed actions show a specific error.
import { expect, test, type Page } from "@playwright/test";
import { authFile, screenshot } from "./helpers";

const emptyState = (page: Page) => page.locator("main div.border-dashed").first();
async function expectEmptyState(page: Page) {
  const box = emptyState(page);
  await expect(box).toBeVisible();
  await expect(box.locator("p.font-semibold")).not.toHaveText("");
  // a hint saying what to do next
  expect(((await box.textContent()) ?? "").length).toBeGreaterThan(20);
}

test.describe("kitchen", () => {
  test.use({ storageState: authFile("kitchen") });
  test("production sheet for a day with no meals has an empty state", async ({ page }, info) => {
    await page.goto("/kitchen/production/2026-11-10");
    await expectEmptyState(page);
    await screenshot(page, "ux-empty-production", info);
  });
  test("waste log with no entries has an empty state", async ({ page }) => {
    await page.goto("/kitchen/waste");
    await expectEmptyState(page);
  });
});

test.describe("operations", () => {
  test.use({ storageState: authFile("ops") });
  test("delivery board for a day with no drops has an empty state", async ({ page }, info) => {
    await page.goto("/staff/delivery?date=2026-11-10");
    await expectEmptyState(page);
    await screenshot(page, "ux-empty-delivery", info);
  });
  test("adding a lead with a phone that is already used shows who has it", async ({ page }, info) => {
    await page.goto("/staff/clients/new");
    await page.getByLabel("First name").fill("Dup");
    await page.getByLabel("Last name").fill("Licate");
    await page.getByLabel("Phone number").fill("0911000001");
    await page.getByRole("button", { name: "Save lead" }).click();
    await expect(page.locator("[data-sonner-toast]").filter({ hasText: "Abel Tesfaye already has this phone number." })).toBeVisible();
    await screenshot(page, "ux-action-error", info);
  });
});

test.describe("nutritionist", () => {
  test.use({ storageState: authFile("nutritionist") });
  test("swap approvals with no requests has an empty state", async ({ page }) => {
    await page.goto("/staff/nutrition/swaps");
    await expectEmptyState(page);
  });
});

test.describe("client", () => {
  test.use({ storageState: authFile("client2") });
  test("saving a weight out of range shows a specific error", async ({ page }) => {
    await page.goto("/app/progress");
    await page.getByLabel("Weight (kg)").fill("300");
    await page.getByRole("button", { name: "Save weight" }).click();
    await expect(page.getByText("Enter your weight in kg (30–250).").first()).toBeVisible();
  });
});
