// Dev helper: screenshot every screen for every role at 390 and 1280 px.
// Usage: node scripts/shots-all.mjs <before|after> [area,...] [baseUrl=http://localhost:3000]
// Writes docs/screenshots/<phase>/<area>/<role>--<page>--<width>.jpg (full page, capped at 4000 px tall).
// Needs the dev server and the seeded dev database (scripts/init.sh).
import { chromium } from "@playwright/test";
import postgres from "postgres";
import { mkdirSync } from "node:fs";

const [phase = "after", areaArg = "", base = "http://localhost:3000"] = process.argv.slice(2);
const only = areaArg ? areaArg.split(",") : null;
const sql = postgres(process.env.DATABASE_URL ?? "postgres://postgres:postgres@localhost:54329/questmeals", { max: 1 });

const one = async (q) => (await q)[0] ?? {};
const { id: clientId } = await one(sql`select c.id from clients c join "user" u on u.id = c.user_id where u.phone_number = '+251911000001'`);
const { id: leadId } = await one(sql`select id from clients where status = 'lead' limit 1`);
const { id: postId } = await one(sql`select id from community_posts order by created_at desc limit 1`);
const { id: challengeId } = await one(sql`select id from challenges limit 1`);
const { d: cookDate } = await one(sql`select to_char(coalesce(min(cook_date) filter (where cook_date >= (now() at time zone 'Africa/Addis_Ababa')::date), max(cook_date)), 'YYYY-MM-DD') as d from order_days`);
await sql.end();
const day = cookDate ?? new Date().toISOString().slice(0, 10);

const STAFF_PW = "QuestDemo2026!";
const ROLES = {
  public: { who: null, pages: { public: ["/", "/login", "/signup", "/calculator", "/offline"] } },
  owner: {
    who: "fahim@questmeals.demo",
    pages: {
      staff: [
        "/staff/dashboard", "/staff", "/staff/clients", `/staff/clients/${clientId}`, "/staff/clients/new", `/staff/clients/${leadId}/onboard`,
        "/staff/payments", "/staff/orders", "/staff/quick-starts", "/staff/nutrition", "/staff/nutrition/profiles", "/staff/nutrition/swaps",
        "/staff/nutrition/checkins", `/staff/nutrition/clients/${clientId}`, "/staff/purchasing", "/staff/delivery", "/staff/community",
        "/staff/partners", "/staff/settings", "/staff/settings/pricing", "/staff/settings/packages", "/staff/settings/ingredients",
        "/staff/settings/nutrition", "/staff/settings/swaps", "/staff/settings/areas", "/staff/settings/schedule", "/staff/settings/changes",
        "/staff/notifications",
      ],
      kitchen: ["/kitchen", "/kitchen/stock"],
    },
  },
  operations: {
    who: "nebiyou@questmeals.demo",
    pages: { staff: ["/staff", "/staff/payments", "/staff/orders", "/staff/purchasing", "/staff/delivery"], kitchen: ["/kitchen/stock", "/kitchen/waste"], delivery: ["/delivery/pickup"] },
  },
  nutritionist: { who: "nutritionist@questmeals.demo", pages: { staff: ["/staff", "/staff/nutrition", "/staff/nutrition/profiles", "/staff/clients"] } },
  kitchen: {
    who: "kitchen@questmeals.demo",
    pages: { kitchen: ["/kitchen", `/kitchen/production/${day}`, `/kitchen/recipes/${day}`, `/kitchen/packing/${day}`, `/kitchen/labels/${day}`, "/kitchen/stock", "/kitchen/waste"] },
  },
  delivery: { who: "rider@questmeals.demo", pages: { delivery: ["/delivery", "/delivery/pickup"] } },
  coach: { who: "dagi@questmeals.demo", pages: { staff: ["/staff/community"] } },
  client: {
    who: "0911000001",
    pw: "Client2026!",
    pages: {
      client: [
        "/app", "/app/menu", "/app/community", `/app/community/${postId}`, "/app/community/challenges", `/app/community/challenges/${challengeId}`,
        "/app/community/new", "/app/notifications", "/app/progress", "/app/plan", "/app/swaps", "/app/pause", "/app/payments", "/app/profile",
      ],
    },
  },
};

const slug = (p) => (p === "/" ? "home" : p.slice(1).replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "id").replace(/\d{4}-\d{2}-\d{2}/g, "date").replace(/\//g, "_"));
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
let ip = 10;
const onlyRoles = process.env.SHOT_ROLES ? process.env.SHOT_ROLES.split(",") : null;
for (const [role, cfg] of Object.entries(ROLES)) {
  if (onlyRoles && !onlyRoles.includes(role)) continue;
  const areas = Object.entries(cfg.pages).filter(([a]) => !only || only.includes(a));
  if (!areas.length) continue;
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
    if (cfg.who) {
      const isPhone = !cfg.who.includes("@");
      const res = await context.request.post(`${base}/api/auth/sign-in/${isPhone ? "phone-number" : "email"}`, {
        data: isPhone ? { phoneNumber: "+251" + cfg.who.slice(1), password: cfg.pw } : { email: cfg.who, password: STAFF_PW },
        headers: { origin: base, "x-forwarded-for": `10.9.0.${ip++}` },
      });
      if (!res.ok()) { console.error(role, "sign-in failed", res.status()); continue; }
    }
    const page = await context.newPage();
    for (const [area, paths] of areas) {
      const dir = `docs/screenshots/${phase}/${area}`;
      mkdirSync(dir, { recursive: true });
      for (const p of paths) {
        const out = `${dir}/${role}--${slug(p)}--${width}.jpg`;
        try {
          const resp = await page.goto(base + p, { waitUntil: "networkidle", timeout: 60000 });
          const h = Math.min(4000, await page.evaluate(() => document.documentElement.scrollHeight));
          await page.screenshot({ path: out, type: "jpeg", quality: 70, clip: { x: 0, y: 0, width, height: h }, fullPage: true });
          console.log(resp?.status(), role, width, p, "->", out);
        } catch (e) {
          console.error("FAIL", role, width, p, String(e).slice(0, 200));
        }
      }
    }
    await context.close();
  }
}
await browser.close();
