// Test helpers: sign in through the API, save screenshots per project, tiny PNG generator, DB access for asserts.
import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, type APIRequestContext, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { createDb } from "../db/client";
import { E2E_DB_URL, LOGINS, testIp, type RoleKey } from "./env";

export { authFile, LOGINS, testIp, type RoleKey } from "./env";
export { makePng } from "./png";

/** Signs a context in through the Better Auth API (like scripts/shot.mjs). */
export async function signIn(target: BrowserContext | APIRequestContext, who: string, password: string, baseURL = "http://localhost:3100") {
  const req = "request" in target ? target.request : target;
  const isPhone = !who.includes("@");
  const res = await req.post(`${baseURL}/api/auth/sign-in/${isPhone ? "phone-number" : "email"}`, {
    data: isPhone ? { phoneNumber: who.startsWith("0") ? "+251" + who.slice(1) : who, password } : { email: who, password },
    headers: { origin: baseURL, "x-forwarded-for": testIp() },
  });
  expect(res.ok(), `sign-in ${who}: ${res.status()}`).toBeTruthy();
}

export async function signInAs(context: BrowserContext, key: RoleKey) {
  await signIn(context, LOGINS[key].who, LOGINS[key].password);
}

/** Saves e2e/screenshots/<project>/<name>.png (full page). */
export async function screenshot(page: Page, name: string, testInfo?: TestInfo) {
  const project = testInfo?.project.name ?? (page.viewportSize()?.width && page.viewportSize()!.width < 600 ? "phone" : "laptop");
  const dir = path.resolve(__dirname, "screenshots", project);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

/**
 * Fails when the page scrolls horizontally. On mobile emulation an over-wide page widens the layout viewport
 * (the browser zooms out), so innerWidth grows with it; compare with the configured viewport width as well.
 */
export async function expectNoHorizontalOverflow(page: Page) {
  const vw = page.viewportSize()?.width ?? 0;
  const { sw, iw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
  expect(sw, `horizontal overflow: scrollWidth ${sw} > innerWidth ${iw}`).toBeLessThanOrEqual(iw + 1);
  expect(iw, `layout viewport ${iw} px is wider than the ${vw} px screen (page zoomed out)`).toBeLessThanOrEqual(vw + 1);
}

// ---- read-only DB access for assertions and setup lookups ------------------------------------
let shared: ReturnType<typeof createDb> | null = null;
export function e2eDb() {
  return (shared ??= createDb(E2E_DB_URL, { max: 2 }));
}
export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await e2eDb().sql.unsafe(text, params as never[])) as unknown as T[];
}
