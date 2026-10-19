// Dev helper: sign in and screenshot a page. Usage:
//   node scripts/shot.mjs <email|phone> <password> <path> <out.png> [width=390] [baseUrl=http://localhost:3000]
import { chromium } from "@playwright/test";

const [who, password, path, out, width = "390", base = "http://localhost:3000"] = process.argv.slice(2);
if (!who || !password || !path || !out) { console.error("usage: node scripts/shot.mjs <email|phone> <password> <path> <out.png> [width]"); process.exit(1); }
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: Number(width), height: 900 } });
const isPhone = !who.includes("@");
const res = await context.request.post(`${base}/api/auth/sign-in/${isPhone ? "phone-number" : "email"}`, {
  data: isPhone ? { phoneNumber: who.startsWith("0") ? "+251" + who.slice(1) : who, password } : { email: who, password },
  headers: { origin: base },
});
if (!res.ok()) { console.error("sign-in failed", res.status(), await res.text()); process.exit(1); }
const page = await context.newPage();
const resp = await page.goto(base + path, { waitUntil: "networkidle" });
await page.screenshot({ path: out, fullPage: true });
console.log(resp?.status(), page.url(), "->", out);
await browser.close();
