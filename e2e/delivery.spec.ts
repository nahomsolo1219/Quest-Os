// Delivery: ops route board (assign rider), rider delivered / failed with reason, pick-up hand over.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });
const PER_PROJECT = {
  phone: { assign: "Bethlehem Tadesse", delivered: "Abel Tesfaye", failed: "Yared Getachew", pickup: "Hiwot Desta" },
  laptop: { assign: "Natnael Worku", delivered: "Liya Haile", failed: "Mikias Alemayehu", pickup: "Sara Mekonnen" },
};
const UNDO_DROP = { phone: "Bethlehem Tadesse", laptop: "Natnael Worku" };
const data = (project: string) => PER_PROJECT[project === "laptop" ? "laptop" : "phone"];
const dropStatus = async (full: string) => {
  const [first, last] = full.split(" ");
  const [r] = await query<{ status: string; failed_reason: string | null }>(
    `select d.status, d.failed_reason from delivery_drops d join clients c on c.id = d.client_id
     where c.first_name = $1 and c.last_name = $2 and d.drop_date = '2026-10-20'`, [first, last]);
  return r;
};

test.describe("operations board", () => {
  test.use({ storageState: authFile("ops") });
  test("drops by area; assign a rider", async ({ page }, info) => {
    await page.goto("/staff/delivery");
    await expect(page.getByRole("heading", { name: "Delivery · Tuesday, 20 October 2026", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: /Bole · \d+ drop/ })).toBeVisible();
    const who = data(info.project.name).assign;
    await page.getByLabel(`Rider for ${who}`).selectOption({ label: "Yonas Haile" });
    await expect(toast(page, "Assigned to Yonas Haile")).toBeVisible();
    const [first] = who.split(" ");
    const [r] = await query<{ name: string }>(`select u.name from delivery_drops d join clients c on c.id = d.client_id join "user" u on u.id = d.rider_user_id
      where c.first_name = $1 and d.drop_date = '2026-10-20'`, [first]);
    expect(r?.name).toBe("Yonas Haile");
    await screenshot(page, "ops-delivery-board", info);
  });

});

test.describe("rider", () => {
  test.use({ storageState: authFile("rider") });
  test("marks one drop delivered and another failed with a reason", async ({ page }, info) => {
    const d = data(info.project.name);
    await page.goto("/delivery");
    await expect(page.getByRole("heading", { name: "My drops", level: 1 })).toBeVisible();
    const card = (name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
    await expect(card(d.delivered).getByRole("link", { name: /^Call \+251/ })).toBeVisible();
    await card(d.delivered).getByRole("button", { name: "Delivered ✓" }).click();
    await expect(toast(page, `${d.delivered}: delivered`)).toBeVisible();
    expect((await dropStatus(d.delivered)).status).toBe("delivered");

    await card(d.failed).getByRole("button", { name: "Failed…" }).click();
    await card(d.failed).getByLabel("Not home").check();
    await card(d.failed).getByRole("button", { name: "Save as failed" }).click();
    await expect(toast(page, "Marked failed. Operations have been told.")).toBeVisible();
    await expect(card(d.failed).getByText("Failed: Not home")).toBeVisible();
    expect(await dropStatus(d.failed)).toEqual({ status: "failed", failed_reason: "Not home" });
    await screenshot(page, "rider-drops", info);
  });

  test("Failed toast offers Undo; Undo puts the drop back to pending", async ({ page }) => {
    // Bethlehem / Natnael: assigned by the ops test above, not marked by any other rider test
    const who = UNDO_DROP[test.info().project.name === "laptop" ? "laptop" : "phone"];
    await page.goto("/delivery");
    const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: who }) });
    await card.getByRole("button", { name: "Failed…" }).click();
    await card.getByLabel("Not home").check();
    await card.getByRole("button", { name: "Save as failed" }).click();
    const t = toast(page, "Marked failed. Operations have been told.");
    await expect(t).toBeVisible();
    expect((await dropStatus(who)).status).toBe("failed");
    await t.getByRole("button", { name: "Undo" }).click();
    await expect(toast(page, "Undone. The drop is pending again.")).toBeVisible();
    expect(await dropStatus(who)).toEqual({ status: "pending", failed_reason: null });
    await expect(card.getByRole("button", { name: "Failed…" })).toBeVisible();
  });

  test("failed without a reason shows a specific message", async ({ page }) => {
    await page.goto("/delivery");
    const item = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Failed…" }) }).first();
    await item.getByRole("button", { name: "Failed…" }).click();
    await item.getByRole("button", { name: "Save as failed" }).click();
    await expect(toast(page, "Pick a reason.")).toBeVisible();
  });

  test("pick-up list: hand over", async ({ page }, info) => {
    const who = data(info.project.name).pickup;
    await page.goto("/delivery/pickup");
    const row = page.getByRole("listitem").filter({ hasText: who });
    await row.getByRole("button", { name: "Hand over" }).click();
    await expect(toast(page, "Handed over")).toBeVisible();
    expect((await dropStatus(who)).status).toBe("delivered");
    await screenshot(page, "rider-pickup", info);
  });
});
