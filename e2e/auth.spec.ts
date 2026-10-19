// AUTH: staff email login, client phone login, wrong password, role homes, client kept out of /staff.
import { expect, test, type Page } from "@playwright/test";
import { authFile, screenshot, testIp } from "./helpers";
import { CLIENT_PASSWORD, STAFF_PASSWORD } from "./env";

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ "x-forwarded-for": testIp() });
});

async function staffLogin(page: Page, email: string, password = STAFF_PASSWORD) {
  await page.goto("/login");
  await page.getByRole("tab", { name: "Staff" }).click();
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

test("staff signs in with email and lands on the owner dashboard", async ({ page }, info) => {
  await staffLogin(page, "dagi@questmeals.demo");
  await expect(page).toHaveURL(/\/staff\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await screenshot(page, "auth-owner-home", info);
});

test("client signs in with phone and lands on /app", async ({ page }, info) => {
  await page.goto("/login");
  await screenshot(page, "auth-login", info);
  await page.getByLabel("Phone number").fill("0911 000 001");
  await page.getByLabel("Password").fill(CLIENT_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
});

test("wrong password shows a specific message", async ({ page }, info) => {
  await page.goto("/login");
  await page.getByLabel("Phone number").fill("0911000001");
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Phone number or password is not right" })).toBeVisible();
  await screenshot(page, "auth-wrong-password", info);

  await staffLogin(page, "nebiyou@questmeals.demo", "wrong-password-123");
  await expect(page.getByRole("alert").filter({ hasText: "Email or password is not right." })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

const HOMES: [string, RegExp, string][] = [
  ["nebiyou@questmeals.demo", /\/staff$/, "Today"],
  ["nutritionist@questmeals.demo", /\/staff$/, "Today"],
  ["kitchen@questmeals.demo", /\/kitchen$/, "Cook days"],
  ["rider@questmeals.demo", /\/delivery$/, "My drops"],
];
for (const [email, url, heading] of HOMES) {
  test(`role home for ${email}`, async ({ page }) => {
    await staffLogin(page, email);
    await expect(page).toHaveURL(url);
    await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
  });
}

test.describe("signed-in client", () => {
  test.use({ storageState: authFile("client") });
  test("a client opening /staff is sent to /app", async ({ page }) => {
    await page.goto("/staff");
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/staff/payments");
    await expect(page).toHaveURL(/\/app$/);
    await page.goto("/kitchen");
    await expect(page).toHaveURL(/\/app$/);
  });
});

test("signed out visitors are sent to /login from protected areas", async ({ page }) => {
  await page.goto("/staff/clients");
  await expect(page).toHaveURL(/\/login\?next=%2Fstaff%2Fclients/);
});
