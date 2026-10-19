// PWA: manifest with icons, service worker file, offline page, service worker registers in the production build.
import { expect, test } from "@playwright/test";
import { authFile, screenshot } from "./helpers";

test("manifest is served with icons", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBeTruthy();
  const m = await res.json();
  expect(m.name).toBe("Quest Meals");
  expect(m.start_url).toBe("/app");
  expect(m.display).toBe("standalone");
  const sizes = (m.icons as { src: string; sizes: string }[]).map((i) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  for (const icon of m.icons as { src: string }[]) {
    const r = await request.get(icon.src);
    expect(r.ok(), icon.src).toBeTruthy();
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

test("/sw.js is served as JavaScript", async ({ request }) => {
  const res = await request.get("/sw.js");
  expect(res.ok()).toBeTruthy();
  expect(res.headers()["content-type"]).toMatch(/javascript/);
  expect(await res.text()).toContain("/offline");
});

test("/offline page renders", async ({ page }, info) => {
  await page.goto("/offline");
  await expect(page.getByRole("heading", { name: "You are offline", level: 1 })).toBeVisible();
  await screenshot(page, "offline", info);
});

test.describe("signed-in client", () => {
  test.use({ storageState: authFile("client") });
  test("service worker registers in the production build", async ({ page }) => {
    await page.goto("/app");
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), { timeout: 15_000 }).toBeGreaterThan(0);
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(scope).toMatch(/localhost:\d+\/$/);
  });
});
