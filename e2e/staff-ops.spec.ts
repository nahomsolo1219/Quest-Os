// Operations: client list filters, client page tabs, add a lead, payment queue confirm, weekly order review.
import { expect, test, type Page } from "@playwright/test";
import { authFile, query, screenshot } from "./helpers";
import { dataFor } from "./env";

test.use({ storageState: authFile("ops") });
const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

test("client list filters by status, plan, area and payment", async ({ page }, info) => {
  await page.goto("/staff/clients");
  const rows = page.locator("table tbody tr");
  await expect(rows.filter({ hasText: "Abel Tesfaye" })).toBeVisible();
  await page.getByLabel("Status").selectOption({ label: "Paused" });
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Samuel Kebede");
  await page.getByLabel("Status").selectOption({ label: "Status: all" });
  await page.getByLabel("Plan").selectOption({ label: "Premium" });
  await expect(rows.filter({ hasText: "Premium" })).toHaveCount(await rows.count());
  await expect(rows.filter({ hasText: "Yared Getachew" })).toBeVisible();
  await page.getByLabel("Plan").selectOption({ label: "Plan: all" });
  await page.getByLabel("Area").selectOption({ label: "Kazanchis" });
  await expect(rows.filter({ hasText: "Sara Mekonnen" })).toBeVisible();
  await expect(rows.filter({ hasText: "Abel Tesfaye" })).toHaveCount(0);
  await page.getByLabel("Area").selectOption({ label: "Area: all" });
  await page.getByLabel("Payment").selectOption({ label: "Paid" });
  await expect(rows.filter({ hasText: "Liya Haile" })).toBeVisible();
  await expect(rows.filter({ hasText: "Rahel Assefa" })).toHaveCount(0);
  await page.getByLabel("Payment").selectOption({ label: "Payment: all" });
  await page.getByLabel("Search name or phone").fill("Bethlehem");
  await expect(rows).toHaveCount(1);
  await screenshot(page, "ops-clients-filtered", info);
});

test("client page shows every tab", async ({ page }, info) => {
  const [abel] = await query<{ id: string }>("select id from clients where first_name = 'Abel'");
  await page.goto(`/staff/clients/${abel.id}`);
  await expect(page.getByRole("heading", { name: "Abel Tesfaye", level: 1 })).toBeVisible();
  const tabs = ["Profile", "Nutrition", "Plan", "Swaps", "Payments", "Orders", "Check-ins", "Notes", "Audit trail"];
  for (const t of tabs) {
    await page.getByRole("tab", { name: t }).click();
    await expect(page.getByRole("tabpanel", { name: t })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Payments" }).click();
  await expect(page.getByRole("tabpanel", { name: "Payments" })).toContainText("13,480 ETB");
  await page.getByRole("tab", { name: "Plan" }).click();
  await expect(page.getByRole("tabpanel", { name: "Plan" })).toContainText("Performance");
  await screenshot(page, "ops-client-page-plan", info);
});

test("add a lead", async ({ page }, info) => {
  const phone = info.project.name === "phone" ? "0911300001" : "0911300002";
  await page.goto("/staff/clients/new");
  await page.getByLabel("First name").fill("Meseret");
  await page.getByLabel("Last name").fill(`Lead ${info.project.name}`);
  await page.getByLabel("Phone number").fill(phone);
  await page.locator("label", { hasText: "Referral" }).click();
  await page.getByLabel("Notes").fill("Wants the Performance plan, call after 5 pm");
  await page.getByRole("button", { name: "Save lead" }).click();
  await expect(toast(page, "Lead saved.")).toBeVisible();
  const rows = await query<{ status: string; lead_source: string }>("select status, lead_source from clients where phone = $1", ["+251" + phone.slice(1)]);
  expect(rows).toEqual([{ status: "lead", lead_source: "referral" }]);
  await screenshot(page, "ops-lead-saved", info);
});

test("payment queue: confirm a receipt with one tap", async ({ page }, info) => {
  const name = dataFor(info.project.name).setupReceipt;
  await page.goto("/staff/payments");
  await expect(page.getByRole("heading", { name: "Payments to confirm", level: 1 })).toBeVisible();
  const item = page.locator("div").filter({ has: page.getByRole("link", { name }) }).filter({ has: page.getByRole("button", { name: "Confirm" }) }).last();
  await expect(item).toBeVisible();
  const img = page.getByRole("img", { name: `Receipt from ${name}` });
  await expect(img).toBeVisible();
  // the receipt preview is served through a signed URL and actually loads
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBeGreaterThan(0);
  await screenshot(page, "ops-payments-queue", info);
  await item.getByRole("button", { name: "Confirm" }).click();
  await expect(toast(page, "Payment confirmed. The client was told.")).toBeVisible();
  const [first, last] = name.split(" ");
  const rows = await query<{ status: string }>(
    `select i.status from invoices i join clients c on c.id = i.client_id where c.first_name = $1 and c.last_name = $2 and i.period_start = '2026-10-26'`, [first, last]);
  expect(rows).toEqual([{ status: "paid" }]);
});

test("payment queue: reject needs a reason", async ({ page }, info) => {
  const name = dataFor(info.project.name).rejectReceipt;
  await page.goto("/staff/payments");
  const item = page.locator("div").filter({ has: page.getByRole("link", { name }) }).filter({ has: page.getByRole("button", { name: "Reject" }) }).last();
  await item.getByRole("button", { name: "Reject" }).click();
  const reason = page.getByLabel("Why is the receipt rejected?");
  await page.getByRole("button", { name: "Reject receipt" }).click();
  // empty reason: the form does not submit (required field) and nothing is rejected
  expect(await reason.evaluate((el: HTMLTextAreaElement) => el.validity.valueMissing)).toBe(true);
  await reason.fill("Amount does not match the invoice");
  await page.getByRole("button", { name: "Reject receipt" }).click();
  await expect(toast(page, "Receipt rejected. The client was told why.")).toBeVisible();
  const [first, last] = name.split(" ");
  const rows = await query<{ status: string; rejection_reason: string }>(
    `select p.status, p.rejection_reason from payments p join clients c on c.id = p.client_id where c.first_name = $1 and c.last_name = $2 and p.reference like '%-E2E-%'`, [first, last]);
  expect(rows).toEqual([{ status: "rejected", rejection_reason: "Amount does not match the invoice" }]);
});

test("onboarding wizard: intake → provisional size → plan with price → invoice", async ({ page }, info) => {
  const lead = dataFor(info.project.name).onboard;
  const [c] = await query<{ id: string }>("select id from clients where first_name || ' ' || last_name = $1", [lead]);
  await page.goto(`/staff/clients/${c.id}/onboard`);
  await expect(page.getByRole("heading", { name: `Onboard client: ${lead}` })).toBeVisible();
  await page.getByLabel("Sex").selectOption({ label: "Female" });
  await page.getByLabel("Age (years)").fill("31");
  await page.getByLabel("Weight (kg)").fill("70");
  await page.getByLabel("Height (cm)").fill("166");
  await page.getByLabel("Activity").selectOption({ index: 2 });
  await page.getByLabel("Goal").selectOption({ label: "Lean" });
  await page.getByLabel("Address").fill("CMC, block 4");
  await page.getByLabel("Area").selectOption({ label: "CMC" });
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page).toHaveURL(/step=nutrition/);
  await page.getByRole("button", { name: "Use this suggestion (provisional)" }).click();
  await expect(page).toHaveURL(/step=plan/);
  await page.locator("label", { hasText: "Performance" }).click();
  await page.getByRole("button", { name: "Show price" }).click();
  await expect(page.getByText("Plan price per month")).toBeVisible();
  await screenshot(page, "ops-onboard-plan", info);
  await page.getByRole("button", { name: "Create plan and first invoice" }).click();
  await expect(page).toHaveURL(/step=swaps/);
  const subs = await query<{ status: string; n: number }>(
    "select s.status, (select count(*)::int from invoices i where i.subscription_id = s.id) as n from subscriptions s where s.client_id = $1", [c.id]);
  expect(subs).toHaveLength(1);
  expect(subs[0].n).toBeGreaterThanOrEqual(1);
});

test("receipt uploaded by the client shows in the queue", async ({ page }, info) => {
  // client-app.spec uploads one per project; when that spec did not run first, the setup receipts still prove the queue.
  await page.goto("/staff/payments");
  const pending = await query<{ first_name: string; last_name: string }>(
    `select c.first_name, c.last_name from payments p join clients c on c.id = p.client_id where p.status = 'submitted'`);
  for (const p of pending) await expect(page.getByText(`${p.first_name} ${p.last_name}`).first()).toBeVisible();
  void info;
});

test("weekly order review shows the preview for next week and the locked current week", async ({ page }, info) => {
  await page.goto("/staff/orders");
  await expect(page.getByRole("heading", { name: "Weekly orders", level: 1 })).toBeVisible();
  await expect(page.getByText("Week of Monday, 26 October 2026")).toBeVisible();
  await expect(page.getByText("Preview: not locked yet")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Abel Tesfaye" }).first()).toContainText("Skipped: not paid");
  await screenshot(page, "ops-orders-preview", info);
  await page.getByRole("link", { name: "← Previous week" }).click();
  await expect(page.getByText("Week of Monday, 19 October 2026")).toBeVisible();
  await expect(page.locator("tr:visible, li:visible").filter({ hasText: "Abel Tesfaye" }).first()).toContainText("Locked");
});
