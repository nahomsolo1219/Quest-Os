// Owner settings: pricing save (toast + validation error), swap table edit, ingredient price edit.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";

test.use({ storageState: authFile("owner") });
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test("pricing settings save with a toast and refuse an invalid value", async ({ page }, info) => {
  await page.goto("/staff/settings/pricing");
  const drop = page.getByLabel("Cost per drop (ETB)");
  const value = info.project.name === "phone" ? "160" : "170";
  await drop.fill(value);
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(toast(page, "Settings saved and logged.")).toBeVisible();
  const [row] = await query<{ v: number }>("select (value->>'dropCostBirr')::int as v from settings where key = 'pricing'");
  expect(row?.v).toBe(Number(value));

  await drop.fill("-5");
  await page.getByRole("button", { name: /^Save/ }).first().click();
  await expect(page.locator("[data-sonner-toast][data-type=error], [role=alert], .text-red-700, .text-destructive").filter({ hasText: /./ }).first()).toBeVisible();
  const [after] = await query<{ v: number }>("select (value->>'dropCostBirr')::int as v from settings where key = 'pricing'");
  expect(after?.v).toBe(Number(value));
  await screenshot(page, "settings-pricing-error", info);
});

test("swap table: edit a rule label", async ({ page }, info) => {
  await page.goto("/staff/settings/swaps");
  const label = `Injera → rice, 45 g dry (${info.project.name})`;
  const labels = page.getByRole("textbox", { name: "Label" });
  const values = await labels.evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
  const i = values.findIndex((v) => v.startsWith("Injera → rice"));
  expect(i, `rules: ${values.join(" | ")}`).toBeGreaterThanOrEqual(0);
  await labels.nth(i).fill(label);
  const save = page.getByRole("button", { name: "Save", exact: true }).nth(i);
  await expect(save).toBeEnabled();
  await save.click();
  await expect(toast(page, "Swap rule saved and logged.")).toBeVisible();
  const rows = await query("select label from swap_rules where label = $1", [label]);
  expect(rows).toHaveLength(1);
  await screenshot(page, "settings-swaps", info);
});

test("ingredient price edit adds a price history row", async ({ page }, info) => {
  await page.goto("/staff/settings/ingredients");
  const item = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Tilapia fillet", exact: true }) });
  const price = info.project.name === "phone" ? "700" : "720";
  await item.getByLabel("ETB per kg").fill(price);
  await item.getByRole("button", { name: "Save price" }).click();
  await expect(toast(page, "Price saved. A price history row was added.")).toBeVisible();
  const rows = await query<{ cost: number; hist: number }>(
    `select i.cost_per_unit_birr as cost, (select count(*)::int from ingredient_prices p where p.ingredient_id = i.id) as hist
     from ingredients i where i.name = 'Tilapia fillet'`);
  expect(rows[0].cost).toBe(Number(price));
  expect(rows[0].hist).toBeGreaterThanOrEqual(1);
  await screenshot(page, "settings-ingredients", info);
});
