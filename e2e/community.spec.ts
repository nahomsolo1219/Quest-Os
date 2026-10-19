// Community: feed, post with a photo (resized to ≤ 1600 px), react, comment, report; ops hides the reported post.
import { expect, test, type Page } from "@playwright/test";
import { authFile, makePng, query, screenshot } from "./helpers";
import { dataFor } from "./env";

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });
const postBody = (project: string) => `Week one done, meal prep photo from the ${project} run`;

test.describe.serial("post → report → hide", () => {
  test("member posts with a photo, reacts and comments", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: authFile(dataFor(info.project.name).payer) });
    const page = await ctx.newPage();
    await page.goto("/app/community");
    await expect(page.getByRole("heading", { name: "Community", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Pinned" }).getByText("Welcome to the Quest community!")).toBeVisible();
    await screenshot(page, "community-feed", info);

    await page.getByRole("link", { name: "New post" }).click();
    await page.getByLabel("What's on your mind?").fill(postBody(info.project.name));
    await page.locator("input#photos").setInputFiles({ name: "prep.png", mimeType: "image/png", buffer: makePng(2000, 1500) });
    await expect(page.getByRole("button", { name: "Post", exact: true })).toBeEnabled({ timeout: 20_000 });
    await page.getByRole("button", { name: "Post", exact: true }).click();
    await expect(toast(page, "Posted.")).toBeVisible({ timeout: 20_000 });
    await expect(page).toHaveURL(/\/app\/community\/[0-9a-f-]{36}$/);

    const img = page.getByRole("img", { name: /^Photo 1 from / });
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(0);
    const size = await img.evaluate((el: HTMLImageElement) => ({ w: el.naturalWidth, h: el.naturalHeight }));
    expect(Math.max(size.w, size.h), `stored photo is ${size.w}×${size.h}`).toBeLessThanOrEqual(1600);
    expect(size.w).toBeGreaterThan(size.h); // aspect kept (landscape)

    await page.getByRole("button", { name: /^Fire \(\d+\)$/ }).click();
    await expect(page.getByRole("button", { name: "Fire (1)" })).toBeVisible();
    await page.getByLabel("Add a comment").fill("Looks great, keep going!");
    await page.getByRole("button", { name: "Comment", exact: true }).click();
    await expect(toast(page, "Comment added.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Comments" }).getByText("Looks great, keep going!")).toBeVisible();
    await screenshot(page, "community-post", info);
    await ctx.close();
  });

  test("another member reports the post", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: authFile("client2") });
    const page = await ctx.newPage();
    const [post] = await query<{ id: string }>("select id from community_posts where body = $1", [postBody(info.project.name)]);
    await page.goto(`/app/community/${post.id}`);
    await page.getByRole("button", { name: "Report post" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason").fill("Shares someone's address in the photo");
    await dialog.getByRole("button", { name: "Send report" }).click();
    await expect(toast(page, "Thanks. Operations will review it.")).toBeVisible();
    await ctx.close();
  });

  test("operations hide the reported post; members no longer see it", async ({ browser }, info) => {
    const ctx = await browser.newContext({ ...info.project.use, storageState: authFile("ops") });
    const page = await ctx.newPage();
    await page.goto("/staff/community");
    const report = page.locator("li, article, div").filter({ hasText: postBody(info.project.name) }).filter({ has: page.getByRole("button", { name: "Hide" }) }).last();
    await expect(report).toBeVisible();
    await screenshot(page, "ops-community-reports", info);
    await report.getByRole("button", { name: "Hide" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Reason for hiding").fill("Private details in photo");
    await dialog.getByRole("button", { name: "Hide" }).click();
    await expect(toast(page, "Hidden from members.")).toBeVisible();
    const [row] = await query<{ hidden_at: Date | null }>("select hidden_at from community_posts where body = $1", [postBody(info.project.name)]);
    expect(row.hidden_at).not.toBeNull();
    await ctx.close();

    const member = await browser.newContext({ ...info.project.use, storageState: authFile("client2") });
    const mp = await member.newPage();
    await mp.goto("/app/community");
    await expect(mp.getByRole("heading", { name: "Community", level: 1 })).toBeVisible();
    await expect(mp.getByText(postBody(info.project.name))).toHaveCount(0);
    await member.close();
  });
});
