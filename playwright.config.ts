import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// Demo copy for e2e/demo.spec.ts: the same build on another port with DEMO_MODE=true and the same e2e database.
const DEMO_PORT = Number(process.env.E2E_DEMO_PORT ?? 3101);
export const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E ?? "postgres://postgres:postgres@localhost:54329/questmeals_e2e";
// Business clock for the run: Tuesday 20 Oct 2026 10:00 Addis (07:00 UTC). Demo is seeded with today = Monday 19 Oct.
export const E2E_FAKE_NOW = "2026-10-20T07:00:00Z";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e/test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: "phone", use: { ...devices["Pixel 5"], viewport: { width: 390, height: 844 } } },
    { name: "laptop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  // Playwright starts these in order, so the demo server starts after the build of the first one.
  webServer: [
    {
      command: `${process.env.E2E_SKIP_BUILD ? "" : "npm run build && "}npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      timeout: 300_000,
      reuseExistingServer: false, // never test against a stale build
      env: serverEnv(PORT),
    },
    {
      command: `npx next start -p ${DEMO_PORT}`,
      url: `http://localhost:${DEMO_PORT}/login`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: { ...serverEnv(DEMO_PORT), DEMO_MODE: "true" },
    },
  ],
});

function serverEnv(port: number): Record<string, string> {
  return {
    DATABASE_URL: E2E_DATABASE_URL,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: ".data/storage-e2e",
    CRON_SECRET: "e2e-cron-secret",
    QM_FAKE_NOW: E2E_FAKE_NOW,
    BETTER_AUTH_URL: `http://localhost:${port}`,
    APP_URL: `http://localhost:${port}`,
    TELEGRAM_BOT_TOKEN: "",
  };
}
