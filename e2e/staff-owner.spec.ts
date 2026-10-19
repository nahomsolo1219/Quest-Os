// Owner: dashboard numbers, partner log, owner-only pages.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") });

  test("dashboard numbers render", async ({ page }, info) => {
    await page.goto("/staff/dashboard");
    await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    const clients = page.getByRole("region", { name: "Clients" });
    await expect(clients.getByText("Active clients")).toBeVisible();
    await expect(clients.getByText(/^\d+$/).first()).toBeVisible();
    await expect(clients.getByText(/[\d,]+ ETB/)).toBeVisible(); // MRR
    const money = page.getByRole("region", { name: "Money this month" });
    for (const label of ["Collected", "Invoiced", "Food cost %", "Margin estimate"]) await expect(money.getByText(label, { exact: true })).toBeVisible();
    await expect(money.getByText(/^-?[\d,]+ ETB$/).first()).toBeVisible();
    const ops = page.getByRole("region", { name: "Operations" });
    await expect(ops.getByText("On-time delivery")).toBeVisible();
    await expect(ops.getByText(/^\d+%$/)).toBeVisible();
    await expect(page.getByText(/NaN|undefined|Infinity/)).toHaveCount(0);
    await screenshot(page, "owner-dashboard", info);
  });

  test("partner log: add an entry", async ({ page }, info) => {
    await page.goto("/staff/partners");
    const note = `Delivery scooter deposit (${info.project.name})`;
    await page.getByLabel("Partner").selectOption({ label: "Kidus Alemu" });
    await page.getByLabel("Type").selectOption({ label: "Cash" });
    await page.getByLabel("Amount (ETB)").fill("15000");
    await page.getByLabel("Note").fill(note);
    await page.getByRole("button", { name: "Log contribution" }).click();
    await expect(toast(page, "Contribution logged.")).toBeVisible();
    await expect(page.getByText(`15,000 ETB · ${note}`)).toBeVisible();
    const rows = await query("select amount_birr from partner_contributions where note = $1", [note]);
    expect(rows).toEqual([{ amount_birr: 15000 }]);
    await screenshot(page, "owner-partners", info);
  });

  test("partner log: cash without an amount shows a specific error", async ({ page }) => {
    await page.goto("/staff/partners");
    await page.getByLabel("Partner").selectOption({ label: "Fahim Mohammed" });
    await page.getByLabel("Type").selectOption({ label: "Cash" });
    await page.getByRole("button", { name: "Log contribution" }).click();
    await expect(page.getByText(/amount/i).filter({ hasNotText: "Amount (ETB)" }).first()).toBeVisible();
  });
});

test.describe("operations", () => {
  test.use({ storageState: authFile("ops") });
  test("owner-only pages redirect operations away", async ({ page }) => {
    await page.goto("/staff/dashboard");
    await expect(page).toHaveURL(/\/staff$/);
    await page.goto("/staff/partners");
    await expect(page).toHaveURL(/\/staff$/);
  });
});
