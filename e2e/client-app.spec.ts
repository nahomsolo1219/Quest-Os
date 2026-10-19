// Client app: today (meals, eat-by, rating), menu, plan, swaps, pause, payments (receipt upload), progress, notifications.
import { expect, test } from "@playwright/test";
import { authFile, makePng, query, screenshot } from "./helpers";
import { dataFor } from "./env";

const toast = (page: import("@playwright/test").Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

test.describe("as the paying client of this project", () => {
  test.use({ storageState: async ({}, use, info) => use(authFile(dataFor(info.project.name).payer)) });

  test("today shows four meals with eat-by dates and a meal can be rated", async ({ page }, info) => {
    await page.goto("/app");
    await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
    await expect(page.getByText("Tuesday, 20 October 2026")).toBeVisible();
    const meals = page.locator("main article");
    await expect(meals).toHaveCount(4);
    for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) await expect(meals.getByText(slot, { exact: true })).toBeVisible();
    // cooked Tue 20 Oct, eat within 3 days
    await expect(meals.first().getByText("Eat by Fri 23 Oct")).toBeVisible();
    await screenshot(page, "client-today", info);

    await meals.first().getByRole("button", { name: "5 of 5" }).click();
    await expect(toast(page, "Thanks for rating your meal.")).toBeVisible();
    await page.reload();
    await expect(page.locator("main article").first().getByText("You rated 5 of 5")).toBeVisible();
    const name = dataFor(info.project.name).payerName.split(" ")[0];
    const rows = await query(`select r.rating from meal_ratings r join clients c on c.id = r.client_id where c.first_name = $1 and r.service_date = '2026-10-20'`, [name]);
    expect(rows.length).toBeGreaterThanOrEqual(1);
  });

  test("menu shows this week (locked) and next week", async ({ page }, info) => {
    await page.goto("/app/menu");
    await expect(page.getByRole("heading", { name: "Menu", level: 1 })).toBeVisible();
    await expect(page.getByText("Locked. This is what the kitchen cooks for you.")).toBeVisible();
    await expect(page.getByRole("heading", { name: /Monday, 19 October 2026 · Menu A/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Thursday, 22 October 2026 · Menu D/ })).toBeVisible();
    await screenshot(page, "client-menu", info);
    await page.getByRole("tab", { name: "Next week" }).click();
    await expect(page.getByText(/Not locked yet — changes until Thu 22 Oct, 18:00/)).toBeVisible();
  });

  test("plan shows size, macros, price and dates", async ({ page }, info) => {
    await page.goto("/app/plan");
    await expect(page.getByRole("heading", { name: "My plan", level: 1 })).toBeVisible();
    await expect(page.getByText("Daily target")).toBeVisible();
    await expect(page.getByText(/Plan price/)).toBeVisible();
    await expect(page.getByText(/Price locked until/)).toBeVisible();
    await screenshot(page, "client-plan", info);
  });

  test("request a swap from the swap table (tilapia → chicken)", async ({ page }, info) => {
    await page.goto("/app/swaps");
    await expect(page.getByText("No swaps yet.")).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: "Tilapia → chicken breast, same grams" });
    await row.getByRole("button", { name: "Add" }).click();
    await expect(toast(page, "Swap approved. It starts the week of Monday, 26 October 2026.")).toBeVisible();
    await expect(page.getByText(/1 of 6 swaps/)).toBeVisible();
    await screenshot(page, "client-swaps", info);
    const name = dataFor(info.project.name).payerName.split(" ")[0];
    const rows = await query<{ status: string; effective_week_start: string }>(
      `select s.status, s.effective_week_start::text from client_swaps s join clients c on c.id = s.client_id where c.first_name = $1`, [name]);
    expect(rows).toEqual([{ status: "approved", effective_week_start: "2026-10-26" }]);
  });

  test("upload a receipt for the week of 26 Oct → waiting for confirmation", async ({ page }, info) => {
    await page.goto("/app/payments");
    const invoice = page.locator("article").filter({ hasText: "Mon 26 Oct – Sun 1 Nov" });
    await expect(invoice.getByText("To pay")).toBeVisible();
    await invoice.getByLabel("Transaction reference").fill(`TB-E2E-${info.project.name.toUpperCase()}`);
    await invoice.locator("input[type=file]").setInputFiles({ name: "receipt.png", mimeType: "image/png", buffer: makePng(400, 600) });
    await expect(invoice.getByRole("img", { name: /Receipt preview/ })).toBeVisible();
    await invoice.getByRole("button", { name: "Send receipt" }).click();
    await expect(toast(page, "Receipt sent. Operations will confirm it soon.")).toBeVisible();
    await expect(page.locator("article").filter({ hasText: "Mon 26 Oct – Sun 1 Nov" }).getByText(/Receipt waiting for confirmation/)).toBeVisible();
    await screenshot(page, "client-payments-submitted", info);
  });

  test("log weight", async ({ page }, info) => {
    await page.goto("/app/progress");
    await page.getByLabel("Weight (kg)").fill("90.4");
    await page.getByRole("button", { name: "Save weight" }).click();
    await expect(toast(page, "Weight saved.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Tuesday, 20 October 2026" }).getByText("90.4 kg")).toBeVisible();
    await screenshot(page, "client-progress", info);
  });

  test("notifications page lists notifications and marks them read", async ({ page }, info) => {
    await page.goto("/app/notifications");
    await expect(page.getByRole("heading", { name: "Notifications", level: 1 })).toBeVisible();
    await expect(page.getByRole("listitem").first()).toBeVisible();
    await screenshot(page, "client-notifications", info);
    await page.getByRole("button", { name: "Mark all as read" }).click();
    await expect(toast(page, "Marked as read.")).toBeVisible();
  });
});

test.describe("as the pausing client of this project", () => {
  test.use({ storageState: async ({}, use, info) => use(authFile(dataFor(info.project.name).pauser)) });

  test("pause the week of 26 Oct shows the new end date", async ({ page }, info) => {
    await page.goto("/app/pause");
    await page.getByLabel("Start week").selectOption({ label: "Week of Monday, 26 October 2026" });
    await page.getByLabel("Number of weeks").selectOption({ label: "1 week" });
    const preview = page.getByText(/Your plan will end on/);
    await expect(preview).toBeVisible();
    const newEnd = (await preview.textContent())!.replace("Your plan will end on ", "").trim();
    await screenshot(page, "client-pause", info);
    await page.getByRole("button", { name: "Confirm pause" }).click();
    await expect(toast(page, `Plan paused. It now ends on ${newEnd}.`)).toBeVisible();
    await expect(page.getByText("Your pauses")).toBeVisible();
  });
});
