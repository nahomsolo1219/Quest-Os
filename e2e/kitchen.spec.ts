// Kitchen: production sheet, recipe cards (pantry), packing list, labels, print layout, stock count one tap.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";

test.use({ storageState: authFile("kitchen") });
const TODAY = "2026-10-20";
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test("cook day picker lists today with meal counts", async ({ page }, info) => {
  await page.goto("/kitchen");
  const today = page.getByRole("listitem").filter({ hasText: "Tuesday, 20 October 2026" });
  await expect(today.getByText("Today")).toBeVisible();
  await expect(today.getByText("32 meals · 8 clients")).toBeVisible();
  await screenshot(page, "kitchen-days", info);
});

test("production sheet for today matches the locked order meals and prints cleanly", async ({ page }, info) => {
  const [{ n }] = await query<{ n: number }>(
    `select count(*)::int as n from order_meals m join order_days d on d.id = m.order_day_id join weekly_orders o on o.id = d.weekly_order_id
     where d.drop_date = $1 and o.status = 'locked'`, [TODAY]);
  await page.goto(`/kitchen/production/${TODAY}`);
  await expect(page.getByRole("heading", { name: "Production sheet · Tuesday, 20 October 2026", level: 1 })).toBeVisible();
  await expect(page.getByText(`${n} meals for 8 clients`)).toBeVisible();
  for (const slot of ["Breakfast", "Lunch", "Dinner", "Snack"]) await expect(page.getByRole("row").filter({ hasText: new RegExp(`^${slot}`) }).first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Egg whites" }).first()).toContainText(/\d+ pc/);
  await screenshot(page, "kitchen-production", info);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
  await screenshot(page, "kitchen-production-print", info);
  await page.emulateMedia({ media: "screen" });
});

test("recipe cards show base recipe, profiles and pantry items", async ({ page }, info) => {
  await page.goto(`/kitchen/recipes/${TODAY}`);
  await expect(page.getByText("4 meals")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(4);
  await expect(page.locator("article").first().getByText(/portions:/)).toBeVisible();
  await expect(page.getByText(/pantry/i).first()).toBeVisible();
  await screenshot(page, "kitchen-recipes", info);
});

test("packing list per client", async ({ page }, info) => {
  await page.goto(`/kitchen/packing/${TODAY}`);
  await expect(page.getByText(/8 clients/)).toBeVisible();
  const abel = page.getByRole("region", { name: "Abel T." });
  await expect(abel.getByText("Delivery · Bole")).toBeVisible();
  await expect(abel.getByText(/eat by Fri 23 Oct/)).toHaveCount(4);
  await expect(page.getByRole("region", { name: "Sara M." }).getByText(/Pick-up at the cafe/)).toBeVisible();
  await screenshot(page, "kitchen-packing", info);
});

test("labels: one per meal, print layout", async ({ page }, info) => {
  await page.goto(`/kitchen/labels/${TODAY}`);
  await expect(page.getByText("32 labels · A4, 3 across. Print at 100% scale.")).toBeVisible();
  await expect(page.getByText("Cooked Tue 20 Oct · Eat by Fri 23 Oct")).toHaveCount(32);
  await screenshot(page, "kitchen-labels", info);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("button", { name: "Print labels" })).toBeHidden();
  await screenshot(page, "kitchen-labels-print", info);
  await page.emulateMedia({ media: "screen" });
});

test("stock count: one tap 'Matches' saves the line", async ({ page }, info) => {
  await page.goto("/kitchen/stock");
  const name = info.project.name === "phone" ? "Chicken breast" : "Tilapia fillet";
  const line = page.getByRole("listitem").filter({ has: page.getByRole("spinbutton", { name, exact: true }) });
  await line.getByRole("button", { name: "Matches" }).click();
  await expect(toast(page, new RegExp(`^${name}: [\\d.]+ kg saved$`))).toBeVisible();
  await expect(page.getByText(/[12] of 44 counted/)).toBeVisible();
  const rows = await query(`select s.count_date::text from stock_counts s join ingredients i on i.id = s.ingredient_id where i.name = $1`, [name]);
  expect(rows).toEqual([{ count_date: TODAY }]);
  await screenshot(page, "kitchen-stock", info);
});
