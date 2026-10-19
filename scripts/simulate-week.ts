// npm run simulate:week — the dry-run gate (PLAN.md section 9).
// Resets questmeals_sim (DATABASE_URL_SIM), seeds demo with today = Mon 19 Oct 2026, then lives through the week of
// Tue 20 – Sat 31 Oct 2026 with a fake clock by calling the real services and jobs as real actors. Business actions go
// through services only; SQL is used read-only for assertions. Every step asserts counts/totals; the Markdown report is
// written to docs/simulation-report.md and printed. Exit code 1 when any assertion fails.
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const SIM_URL = process.env.DATABASE_URL_SIM ?? "postgres://postgres:postgres@localhost:54329/questmeals_sim";
// Everything (including any service that falls back to the shared client) talks to the simulation database.
process.env.DATABASE_URL = SIM_URL;
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_DIR = ".data/storage-sim";
process.env.TELEGRAM_BOT_TOKEN = "";

import { eq } from "drizzle-orm";
import { createDb } from "../db/client";
import { dropSchemas, runMigrations } from "../db/migrate";
import { seedAll } from "../db/seed";
import * as s from "../db/schema";
import { loadActor, type Actor } from "../src/server/authz";
import { runJob, type JobName } from "../src/server/jobs";
import { confirmPayment } from "../src/server/services/billing";
import { logWeight, pauseMyPlan, requestSwap, uploadReceipt } from "../src/server/services/client-app";
import { addComment, challengeDetail, checkInChallenge, createChallenge, createPost, react } from "../src/server/services/community";
import { setIngredientPrice } from "../src/server/services/catalog";
import { ownerDashboard } from "../src/server/services/dashboard";
import { assignRider, markDelivered, markFailed } from "../src/server/services/delivery";
import { logPurchase, recordStockCount, shoppingListForWeek } from "../src/server/services/inventory";
import { labelsForDate, packingForDate, productionForDate } from "../src/server/services/kitchen";
import { logCheckin } from "../src/server/services/nutrition";
import { rateMeal } from "../src/server/services/ratings";
import { signUp, type SignUpInput } from "../src/server/services/signup";
import type { Ctx } from "../src/server/services/context";
import { addDays, addisInstant } from "../src/domain/time";
import { makePng } from "../e2e/png";

// ---------------------------------------------------------------------------------------------------------------
// report + assertions

const report: string[] = [];
const failures: string[] = [];
let section = "";
const line = (text = "") => report.push(text);
function heading(title: string) {
  section = title;
  line();
  line(`## ${title}`);
  line();
}
function check(ok: unknown, message: string) {
  if (ok) line(`- ✅ ${message}`);
  else {
    line(`- ❌ **FAILED:** ${message}`);
    failures.push(`${section}: ${message}`);
  }
  return Boolean(ok);
}
function eqCheck<T>(actual: T, expected: T, what: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return check(ok, ok ? `${what} = ${fmt(actual)}` : `${what}: expected ${fmt(expected)}, got ${fmt(actual)}`);
}
const fmt = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
/** Runs a step; an exception (app bug or wrong expectation) is recorded and the simulation continues. */
async function step(title: string, fn: () => Promise<void>) {
  heading(title);
  try {
    await fn();
  } catch (e) {
    const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    check(false, `step threw ${msg}`);
    if (e instanceof Error && e.stack) line("\n```\n" + e.stack.split("\n").slice(0, 6).join("\n") + "\n```");
  }
}
const birr = (n: number | null | undefined) => (n == null ? "—" : `${Math.round(n).toLocaleString("en-US")} ETB`);
const round10 = (n: number) => Math.round(n / 10) * 10;

// ---------------------------------------------------------------------------------------------------------------
// clock and database

/** Addis wall-clock time → instant (UTC = Addis − 3 h). */
const at = (date: string, time: string) => addisInstant(date, time);

const { db, sql } = createDb(SIM_URL, { max: 4 });
type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, params: unknown[] = []) => (await sql.unsafe(text, params as never[])) as unknown as T[];
const n = async (text: string, params: unknown[] = []) => Number((await q<{ n: number }>(text, params))[0]?.n ?? 0);

async function job(name: JobName, now: Date) {
  const r = await runJob(db, name, now);
  return r.result as Record<string, unknown>;
}

// ---------------------------------------------------------------------------------------------------------------
// actors

const actors = new Map<string, Actor>();
async function staff(email: string): Promise<Actor> {
  const key = `staff:${email}`;
  if (!actors.has(key)) {
    const [u] = await db.select().from(s.user).where(eq(s.user.email, email));
    if (!u) throw new Error(`no staff user ${email}`);
    actors.set(key, (await loadActor(db, u.id))!);
  }
  return actors.get(key)!;
}
async function client(first: string) {
  const [c] = await db.select().from(s.clients).where(eq(s.clients.firstName, first));
  if (!c) throw new Error(`no client ${first}`);
  const actor = c.userId ? await loadActor(db, c.userId) : null;
  return { c, actor: actor! };
}
const ctx = (actor: Actor | null, now: Date): Ctx => ({ db, actor, now });
const receipt = () => new File([new Uint8Array(makePng(300, 420))], "receipt.png", { type: "image/png" });

async function issuedInvoice(clientId: string, periodStart: string) {
  const [inv] = await q<{ id: string; amount_birr: number; status: string }>(
    "select id, amount_birr, status from invoices where client_id = $1 and period_start = $2 and status <> 'void' order by created_at", [clientId, periodStart]);
  return inv;
}
async function pendingPayment(invoiceId: string) {
  const [p] = await q<{ id: string }>("select id from payments where invoice_id = $1 and status = 'submitted'", [invoiceId]);
  return p;
}
const notifications = (kind: string) => n("select count(*)::int as n from notifications where kind = $1", [kind]);

// ---------------------------------------------------------------------------------------------------------------

const W = "2026-10-26"; // the week cooked in this simulation
const DAYS = ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"];
const summary: Record<string, string | number> = {};

async function main() {
  const t0 = Date.now();
  line("# Week simulation report");
  line();
  line(`Generated by \`npm run simulate:week\` (scripts/simulate-week.ts) against \`${new URL(SIM_URL).pathname.slice(1)}\`.`);
  line("Fake clock: Addis Ababa time (UTC+3). Demo seeded with today = Monday 19 October 2026; the simulation runs");
  line("Tuesday 20 – Saturday 31 October 2026 by calling services and jobs as real staff and client accounts.");

  await step("Setup — reset and seed", async () => {
    await dropSchemas(SIM_URL);
    await runMigrations(SIM_URL);
    rmSync(path.resolve(".data/storage-sim"), { recursive: true, force: true });
    mkdirSync(path.resolve(".data/storage-sim"), { recursive: true });
    const r = await seedAll(db, { demo: true, today: "2026-10-19" });
    line(`Seeded: ${JSON.stringify(r.demo)}; profile portions ${r.portions.inserted}.`);
    line();
    eqCheck(await n("select count(*)::int as n from ingredients where cost_per_unit_birr is not null"), 0, "ingredients with a price (empty by design)");
    eqCheck(await n("select count(*)::int as n from weekly_orders"), 0, "weekly orders before any lock");
  });

  const ops = await staff("nebiyou@questmeals.demo");
  const owner = await staff("fahim@questmeals.demo");
  const dagi = await staff("dagi@questmeals.demo");
  const hana = await staff("nutritionist@questmeals.demo");
  const kitchen = await staff("kitchen@questmeals.demo");
  const rider = await staff("rider@questmeals.demo");
  const abel = await client("Abel");
  const sara = await client("Sara");
  const mikias = await client("Mikias");
  const natnael = await client("Natnael");
  const hiwot = await client("Hiwot");
  const samuel = await client("Samuel");

  // -------------------------------------------------------------------------------------------------------------
  await step("Tue 20 Oct 10:00 — Tuesday reminder", async () => {
    const expected = await n("select count(*)::int as n from clients where status = 'active' and user_id is not null");
    const before = await notifications("reminder.weekly");
    const r = await job("tuesday-reminder", at("2026-10-20", "10:00"));
    const after = await notifications("reminder.weekly");
    line(`Job result: ${JSON.stringify(r)}`);
    line();
    eqCheck(after - before, expected, "reminders sent (active clients with an account)");
    await job("tuesday-reminder", at("2026-10-20", "10:05"));
    eqCheck(await notifications("reminder.weekly"), after, "reminders after running the job again (no duplicates)");
    summary["Tuesday reminders"] = after - before;
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Tue 20 – Thu 22 Oct — receipts uploaded and confirmed (week of 26 Oct)", async () => {
    const payers: [typeof abel, "telebirr" | "cbe", string, string][] = [
      [abel, "telebirr", "2026-10-20 12:00", "2026-10-20 14:00"],
      [sara, "cbe", "2026-10-21 09:00", "2026-10-21 11:00"],
      [natnael, "telebirr", "2026-10-21 15:00", "2026-10-21 17:00"],
      [samuel, "cbe", "2026-10-22 10:00", "2026-10-22 12:00"],
    ];
    line("| Client | Invoice | Method | Uploaded | Confirmed |");
    line("|---|---|---|---|---|");
    for (const [who, method, up, conf] of payers) {
      const inv = await issuedInvoice(who.c.id, W);
      if (!inv) throw new Error(`${who.c.firstName} has no invoice for ${W}`);
      const [ud, ut] = up.split(" ");
      const [cd, ct] = conf.split(" ");
      await uploadReceipt(ctx(who.actor, at(ud, ut)), { invoiceId: inv.id, method, reference: `${method === "cbe" ? "FT" : "TB"}SIM${who.c.phone.slice(-4)}`, receipt: receipt() });
      const p = await pendingPayment(inv.id);
      await confirmPayment(ctx(ops, at(cd, ct)), p.id);
      line(`| ${who.c.firstName} ${who.c.lastName} | ${birr(inv.amount_birr)} | ${method} | ${up} | ${conf} |`);
    }
    line();
    const paid = await q<{ first_name: string }>(
      "select c.first_name from invoices i join clients c on c.id = i.client_id where i.period_start = $1 and i.kind = 'weekly' and i.status = 'paid' order by 1", [W]);
    eqCheck(paid.map((r) => r.first_name), ["Abel", "Natnael", "Samuel", "Sara"], "weekly invoices paid for the week of 26 Oct");
    const stored = await n("select count(*)::int as n from payments where receipt_key is not null and status = 'confirmed' and submitted_at > '2026-10-20'");
    eqCheck(stored, 4, "confirmed payments with a stored receipt photo");
    const unpaid = await issuedInvoice(hiwot.c.id, W);
    eqCheck(unpaid?.status, "issued", "Hiwot (weekly billing) does not pay: invoice still issued");
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Wed 21 Oct 10:00 — Mikias pauses the week of 26 Oct", async () => {
    const [before] = await q<{ end_date: string }>("select end_date::text from subscriptions where client_id = $1", [mikias.c.id]);
    const r = await pauseMyPlan(ctx(mikias.actor, at("2026-10-21", "10:00")), { startWeek: W, weeks: 1 });
    const [after] = await q<{ end_date: string }>("select end_date::text from subscriptions where client_id = $1", [mikias.c.id]);
    line(`Pause result: ${JSON.stringify(r)}`);
    line();
    eqCheck(after.end_date, addDays(before.end_date, 7), `end date moved 7 days (${before.end_date} → ${after.end_date})`);
    const [inv] = await q<{ status: string }>("select status from invoices where client_id = $1 and period_start = $2", [mikias.c.id, W]);
    eqCheck(inv?.status, "void", "Mikias's issued invoice for the paused week is voided (D034)");
  });

  // -------------------------------------------------------------------------------------------------------------
  const ingredientId = async (name: string) => (await q<{ id: string }>("select id from ingredients where name = $1", [name]))[0].id;
  await step("Tue 20 – Thu 22 Oct — swaps from the swap table", async () => {
    const rule = async (code: string) => (await q<{ id: string }>("select id from swap_rules where code = $1", [code]))[0].id;
    const swaps: [typeof abel, string, string][] = [
      [abel, "TILAPIA_TO_CHICKEN", "2026-10-20 18:30"],
      [natnael, "INJERA_TO_RICE", "2026-10-21 20:00"],
      [sara, "SWEET_TO_SAVORY_SNACK", "2026-10-22 17:30"],
    ];
    for (const [who, code, when] of swaps) {
      const [d, t] = when.split(" ");
      const row = await requestSwap(ctx(who.actor, at(d, t)), { swapRuleId: await rule(code) });
      eqCheck({ status: row.status, from: row.effectiveWeekStart }, { status: "approved", from: W }, `${who.c.firstName}: ${code} at ${when}`);
    }
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Thu 22 Oct 16:00 — last call; 18:00 — Thursday lock and quick-start lock", async () => {
    const lc = await job("thursday-last-call", at("2026-10-22", "16:00"));
    line(`Last call: ${JSON.stringify(lc)}`);
    line();
    eqCheck(lc.unpaid, 1, "unpaid invoices due at today's cutoff");
    const [hiwotCall] = await q<{ n: number }>("select count(*)::int as n from notifications where kind = 'reminder.last_call' and user_id = $1", [hiwot.c.userId]);
    eqCheck(hiwotCall.n, 1, "Hiwot got the 16:00 last-call notification");

    const invBefore = await n("select count(*)::int as n from invoices");
    const idsBefore = (await q<{ id: string }>("select id from invoices")).map((r) => r.id);
    const lockAt = new Date(at("2026-10-22", "18:00").getTime() + 5000);
    const lock = await job("thursday-lock", lockAt);
    const qs = await job("daily-quick-start", lockAt);
    line(`Thursday lock: ${JSON.stringify(lock)}`);
    line();
    line(`Quick-start lock: ${JSON.stringify(qs)}`);
    line();
    eqCheck({ locked: lock.locked, skippedUnpaid: lock.skippedUnpaid, paused: lock.paused }, { locked: 7, skippedUnpaid: 1, paused: 1 }, "locked / skipped unpaid / paused");
    const orders = await q<{ first_name: string; status: string }>(
      "select c.first_name, o.status from weekly_orders o join clients c on c.id = o.client_id where o.week_start = $1 order by 1", [W]);
    line(`Orders for the week of 26 Oct: ${orders.map((o) => `${o.first_name} ${o.status}`).join(", ")}`);
    line();
    eqCheck(orders.find((o) => o.first_name === "Hiwot")?.status, "skipped_unpaid", "Hiwot skipped for non-payment");
    eqCheck(orders.find((o) => o.first_name === "Mikias")?.status, "paused", "Mikias paused");
    const meals = await n(`select count(*)::int as n from order_meals m join order_days d on d.id = m.order_day_id join weekly_orders o on o.id = d.weekly_order_id
      where o.week_start = $1 and o.status = 'locked'`, [W]);
    eqCheck(meals, 7 * 7 * 4, "order meals = 7 locked clients × 7 days × 4");
    const created = (await n("select count(*)::int as n from invoices")) - invBefore;
    eqCheck(lock.invoicesCreated, created, "invoices created for the following period");
    check(created > 0, `${created} new invoices (period starting the week after next)`);
    const periods = await q<{ period_start: string; kind: string; n: number }>(
      "select period_start::text, kind, count(*)::int as n from invoices where not (id = any($1::uuid[])) group by 1, 2 order by 1", [idsBefore]);
    line(`New invoice periods: ${periods.map((p) => `${p.kind} ${p.period_start} × ${p.n}`).join(", ")}`);
    line();
    const [summaryNote] = await q<{ body: string }>("select body from notifications where kind = 'ops.lock_summary' and dedupe_key = $1", [`lock-summary:${W}:${ops.userId}`]);
    check(summaryNote, `ops lock summary: "${summaryNote?.body ?? "missing"}"`);
    const notesBefore = await n("select count(*)::int as n from notifications");
    const again = await job("thursday-lock", new Date(lockAt.getTime() + 60_000));
    await job("daily-quick-start", new Date(lockAt.getTime() + 60_000));
    eqCheck(again.invoicesCreated, 0, "re-run: no new invoices");
    eqCheck(await n(`select count(*)::int as n from order_meals m join order_days d on d.id = m.order_day_id join weekly_orders o on o.id = d.weekly_order_id where o.week_start = $1`, [W]), meals, "re-run: order meals unchanged");
    eqCheck(await n("select count(*)::int as n from notifications"), notesBefore, "re-run: no new notifications");

    // swaps reflected in the locked meals
    const tilapia = await ingredientId("Tilapia fillet");
    const injera = await ingredientId("Injera");
    const has = async (clientId: string, date: string, slot: string, ingId: string) => {
      const [m] = await q<{ items: { ingredients: { ingredientId: string }[] }[] }>(
        "select m.items from order_meals m join order_days d on d.id = m.order_day_id where m.client_id = $1 and d.service_date = $2 and m.slot = $3", [clientId, date, slot]);
      if (!m) return null;
      return m.items.some((it) => it.ingredients.some((i) => i.ingredientId === ingId));
    };
    eqCheck(await has(abel.c.id, "2026-10-29", "dinner", tilapia), false, "Abel's Thursday dinner has no tilapia (swapped to chicken)");
    eqCheck(await has(sara.c.id, "2026-10-29", "dinner", tilapia), true, "Sara's Thursday dinner still has tilapia (no swap)");
    eqCheck(await has(natnael.c.id, "2026-10-28", "lunch", injera), false, "Natnael's Wednesday lunch has no injera (swapped to rice)");
    eqCheck(await has(abel.c.id, "2026-10-28", "lunch", injera), true, "Abel's Wednesday lunch still has injera");
    const snacks = await q<{ items: { source?: { code: string } }[]; name: string }>(
      `select m.items, ml.name from order_meals m join order_days d on d.id = m.order_day_id join meals ml on ml.id = m.meal_id
       where m.client_id = $1 and m.slot = 'snack' and d.service_date between '2026-10-26' and '2026-11-01'`, [sara.c.id]);
    const swapped = snacks.filter((m) => m.items.some((it) => it.source?.code === "SWEET_TO_SAVORY_SNACK") || /savory|boiled/i.test(m.name));
    eqCheck(swapped.length, 7, "Sara's 7 snacks are the savory snack");
    summary["Locked / skipped / paused"] = `${lock.locked} / ${lock.skippedUnpaid} / ${lock.paused}`;
    summary["Order meals locked for 26 Oct week"] = meals;
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Fri 23 Oct 08:00 — Friday shopping list (prices still empty)", async () => {
    const r = await job("friday-shopping", at("2026-10-23", "08:00"));
    line(`Job result: ${JSON.stringify(r)}`);
    line();
    const list = await shoppingListForWeek(ctx(ops, at("2026-10-23", "08:05")), W);
    // independent sum of what the locked meals need, per stock ingredient (egg whites are counted as eggs)
    const ings = await q<{ id: string; name: string; stock_ingredient_id: string | null; tracked_in_stock: boolean }>("select id, name, stock_ingredient_id, tracked_in_stock from ingredients");
    const byId = new Map(ings.map((i) => [i.id, i]));
    const rows = await q<{ items: { ingredients: { ingredientId: string; qty: number }[] }[] }>(
      `select m.items from order_meals m join order_days d on d.id = m.order_day_id join weekly_orders o on o.id = d.weekly_order_id
       where o.status = 'locked' and m.cook_date between $1 and $2`, [W, addDays(W, 6)]);
    const need = new Map<string, number>();
    for (const r2 of rows) for (const it of r2.items) for (const x of it.ingredients) {
      const ing = byId.get(x.ingredientId)!;
      const target = ing.stock_ingredient_id ?? ing.id;
      if (!byId.get(target)!.tracked_in_stock) continue;
      need.set(target, (need.get(target) ?? 0) + x.qty);
    }
    const lines = new Map(list.lines.map((l) => [l.ingredientId, l]));
    const missingLines = [...need.keys()].filter((id) => !lines.has(id)).map((id) => byId.get(id)!.name);
    eqCheck(missingLines, [], "tracked ingredients needed without a shopping line");
    const off = [...need.entries()].filter(([id, qty]) => Math.abs((lines.get(id)?.needQty ?? 0) - qty) > 1).map(([id]) => byId.get(id)!.name);
    eqCheck(off, [], "lines whose need differs from the locked meals");
    const eggs = list.lines.find((l) => l.name === "Eggs")!;
    const eggWhite = ings.find((i) => i.name === "Egg white")!.id;
    let whites = 0;
    let wholes = 0;
    for (const r2 of rows) for (const it of r2.items) for (const x of it.ingredients) {
      if (x.ingredientId === eggWhite) whites += x.qty;
      if (byId.get(x.ingredientId)!.name === "Eggs") wholes += x.qty;
    }
    eqCheck(eggs.needQty, wholes + whites, `eggs need = whole eggs ${wholes} + egg whites ${whites}`);
    check(list.lines.every((l) => l.buyQty >= 0 && l.buyUnits >= 0), "every buy quantity ≥ 0");
    check(list.lines.every((l) => l.costBirr === null), `every line is "price missing" (${list.missingPrices.length} ingredients without a price)`);
    line();
    line(`${list.lines.length} lines for ${list.mealsCount} meals; stock as of ${list.stockAsOf}. First lines:`);
    line();
    line("| Ingredient | Need | Buy | Cost |");
    line("|---|---|---|---|");
    for (const l of list.lines.slice(0, 8)) line(`| ${l.name} | ${l.needUnits} ${l.purchaseUnitLabel} | ${l.buyUnits} ${l.purchaseUnitLabel} | ${l.costBirr == null ? "price missing" : birr(l.costBirr)} |`);
    summary["Shopping lines (26 Oct week)"] = list.lines.length;
  });

  // -------------------------------------------------------------------------------------------------------------
  const PRICE_BY_NAME: Record<string, number> = {
    "Chicken breast": 650, "Lean beef, diced": 900, "Lean minced beef": 850, "Tilapia fillet": 700, Eggs: 15, Injera: 25,
    Ayib: 350, Feta: 1200, "Greek yogurt": 450, Milk: 90, Mozzarella: 1100, Broccoli: 180, Cabbage: 40, Carrot: 60, Cauliflower: 150,
    Cucumber: 70, "Green beans": 120, "Green peppers": 100, "Habesha gomen": 50, Onion: 80, Potatoes: 50, Spinach: 90,
    "Sweet potatoes": 70, Tomatoes: 70, Zucchini: 120, Apple: 450, Banana: 90, Papaya: 80, "Lasagna sheets": 600, Oats: 300,
    Pasta: 180, Rice: 160, "Whole-wheat bread": 220, "Whole-wheat tortillas": 400, "Dry beans": 140, "Cooking oil": 330,
    "Baking powder": 600, Cinnamon: 1500, Honey: 700, Mitmita: 900, "Peanut butter": 650, Stevia: 2500, "Unsweetened cocoa": 1400,
    "Vanilla extract": 3000,
  };
  await step("Sat 24 Oct — purchases logged for every ingredient", async () => {
    const list = await shoppingListForWeek(ctx(ops, at("2026-10-24", "09:00")), W);
    const ings = await q<{ id: string; name: string; purchase_unit: string; tracked_in_stock: boolean; stock_ingredient_id: string | null }>(
      "select id, name, purchase_unit, tracked_in_stock, stock_ingredient_id from ingredients order by name");
    let total = 0;
    let count = 0;
    for (const ing of ings) {
      const price = PRICE_BY_NAME[ing.name] ?? 300;
      if (ing.stock_ingredient_id) continue; // egg white is costed and stocked as eggs (D338)
      if (!ing.tracked_in_stock) {
        await setIngredientPrice(ctx(owner, at("2026-10-24", "09:30")), { id: ing.id, costPerUnitBirr: price });
        continue;
      }
      const l = list.lines.find((x) => x.ingredientId === ing.id);
      const qty = ing.purchase_unit === "piece" ? Math.max(1, Math.ceil(l?.buyUnits ?? 1)) : Math.max(0.5, l?.buyUnits ?? 0.5);
      const totalPrice = Math.max(1, Math.round(qty * price));
      await logPurchase(ctx(ops, at("2026-10-24", "10:00")), { ingredientId: ing.id, qty, totalPriceBirr: totalPrice, supplier: "Merkato", purchasedOn: "2026-10-24" });
      total += totalPrice;
      count++;
    }
    line(`${count} purchases logged at Merkato for ${birr(total)}.`);
    line();
    eqCheck(await n("select count(*)::int as n from ingredients where cost_per_unit_birr is null and stock_ingredient_id is null"), 0, "ingredients still without a price");
    const after = await shoppingListForWeek(ctx(ops, at("2026-10-24", "18:00")), W);
    check(Number.isFinite(after.totalBirr) && after.missingPrices.length === 0, `shopping list total is a number: ${birr(after.totalBirr)} (missing prices: ${after.missingPrices.length})`);
    check(after.lines.every((l) => l.buyQty === 0 || l.costBirr != null), "every line still to buy has a cost");
    summary["Purchases (Sat 24 Oct)"] = `${count} lines, ${birr(total)}`;
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Sun 25 Oct 17:00 — stock count and Sunday reminder", async () => {
    const tracked = await q<{ id: string; name: string; purchase_unit: string }>(
      "select id, name, purchase_unit from ingredients where tracked_in_stock and stock_ingredient_id is null order by name");
    const now = at("2026-10-25", "17:00");
    let i = 0;
    for (const ing of tracked) {
      // most lines "match" in one tap; every fifth line is counted by hand (a little less than bought)
      if (i++ % 5 === 0) {
        const [bought] = await q<{ qty: number }>("select coalesce(sum(qty), 0)::int as qty from purchases where ingredient_id = $1", [ing.id]);
        const units = ing.purchase_unit === "piece" ? Math.floor(bought.qty * 0.95) : Math.floor((bought.qty * 0.95) / (ing.purchase_unit === "kg" ? 1000 : 920) * 10) / 10;
        await recordStockCount(ctx(kitchen, now), { ingredientId: ing.id, countDate: "2026-10-25", qty: Math.max(0, units) });
      } else {
        await recordStockCount(ctx(kitchen, now), { ingredientId: ing.id, countDate: "2026-10-25", matchesExpected: true });
      }
    }
    eqCheck(await n("select count(*)::int as n from stock_counts where count_date = '2026-10-25'"), tracked.length, "stock lines counted (every tracked ingredient)");
    const r = await job("sunday-stock", now);
    const kitchenUsers = await n("select count(*)::int as n from \"user\" where 'kitchen' = any(roles)");
    eqCheck(r.notified, kitchenUsers, "Sunday stock reminder sent to kitchen staff");
    const list = await shoppingListForWeek(ctx(ops, at("2026-10-25", "18:00")), W);
    const toBuy = list.lines.filter((l) => l.buyQty > 0).length;
    line(`After the count the list for 26 Oct still has ${toBuy} lines to buy (${birr(list.totalBirr)}).`);
  });

  // -------------------------------------------------------------------------------------------------------------
  // Mon 26 – Sat 31: mornings, kitchen sheets, deliveries; quick starts on Monday; community and check-ins.
  const bole = (await q<{ id: string }>("select id from areas where name = 'Bole'"))[0].id;
  const essential = (await q<{ id: string }>("select id from packages where code = 'essential'"))[0].id;
  const qsInput = (first: string, phone: string): SignUpInput => ({
    firstName: first, lastName: "Quickstart", phone, password: "QuickStart2026!", sex: "female", age: 29, weightKg: 66, heightCm: 168,
    activity: "moderate", goal: "lean", allergies: [], dislikes: [], address: "Bole Medhanialem, house 9", areaId: bole, landmark: "Behind the church",
    deliveryOption: "daily", plan: { packageId: essential, billingPeriod: "weekly", start: "quick_start" }, source: "instagram",
  });
  const qs = { first: { id: "", userId: "", amount: 0 }, second: { id: "", userId: "", amount: 0 } };
  let challengeId = "";
  const posts: Record<string, string> = {};

  const dayReport: { date: string; meals: number; labels: number; clients: number; drops: number; delivered: number; failed: number }[] = [];
  async function serviceDay(date: string, failOne: boolean) {
    const morning = await job("daily-morning", at(date, "06:00"));
    const k = ctx(kitchen, at(date, "06:30"));
    const prod = await productionForDate(k, date);
    const labels = await labelsForDate(k, date);
    const packing = await packingForDate(k, date);
    const meals = await q<{ eat_by: string; cook_date: string; service_date: string; slot: string; items: { ingredients: { ingredientId: string }[] }[] }>(
      `select m.eat_by::text, m.cook_date::text, d.service_date::text, m.slot, m.items from order_meals m join order_days d on d.id = m.order_day_id
       join weekly_orders o on o.id = d.weekly_order_id where m.cook_date = $1 and o.status = 'locked'`, [date]);
    const clientsToday = await n(`select count(distinct m.client_id)::int as n from order_meals m join order_days d on d.id = m.order_day_id
       join weekly_orders o on o.id = d.weekly_order_id where m.cook_date = $1 and o.status = 'locked'`, [date]);
    eqCheck(prod.mealsCount, meals.length, `${date}: production sheet portions = order meals cooked`);
    eqCheck(labels.length, meals.length, `${date}: labels = meals`);
    eqCheck(packing.length, clientsToday, `${date}: packing list entries = clients`);
    const shortIds = new Set((await q<{ id: string }>("select id from ingredients where short_shelf_life")).map((r) => r.id));
    const wrongEatBy = meals.filter((m) => {
      const short = m.items.some((it) => it.ingredients.some((x) => shortIds.has(x.ingredientId)));
      return m.eat_by !== addDays(m.cook_date, short ? 2 : 3);
    });
    eqCheck(wrongEatBy.length, 0, `${date}: eat-by = cook + 3, or + 2 for tilapia / injera meals`);
    const sorted = (xs: string[]) => [...xs].sort().join(",");
    check(sorted(labels.map((l) => l.eatBy)) === sorted(meals.map((m) => m.eat_by)), `${date}: label eat-by dates match the order meals`);
    if (date === "2026-10-28") {
      const lunch = meals.filter((m) => m.slot === "lunch");
      const plus2 = lunch.filter((m) => m.eat_by === addDays(date, 2)).length;
      eqCheck(plus2, lunch.length - 1, "Wednesday lunch (injera) eat-by cook + 2 for everyone but Natnael (rice swap)");
    }
    if (date === "2026-10-29") {
      const dinner = meals.filter((m) => m.slot === "dinner");
      const plus2 = dinner.filter((m) => m.eat_by === addDays(date, 2)).length;
      eqCheck(plus2, dinner.length - 1, "Thursday dinner (tilapia) eat-by cook + 2 for everyone but Abel (chicken swap)");
    }
    if (date === "2026-10-31") {
      const sunday = meals.filter((m) => m.service_date === "2026-11-01").length;
      const saturday = meals.filter((m) => m.service_date === "2026-10-31").length;
      check(sunday > 0 && sunday === saturday, `Saturday's sheet includes Sunday's meals (${saturday} Saturday + ${sunday} Sunday)`);
    }

    // deliveries: ops assigns the day's delivery drops to the rider; the rider delivers by 11:00, one fails
    const drops = await q<{ id: string; kind: string; first_name: string }>(
      "select d.id, d.kind, c.first_name from delivery_drops d join clients c on c.id = d.client_id where d.drop_date = $1 order by d.route_position", [date]);
    const deliveryIds = drops.filter((d) => d.kind === "delivery").map((d) => d.id);
    if (deliveryIds.length) await assignRider(ctx(ops, at(date, "07:00")), deliveryIds, rider.userId);
    let delivered = 0;
    let failed = 0;
    for (const [i, d] of drops.entries()) {
      const when = at(date, `${String(8 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "10"}`);
      if (d.kind === "pickup") {
        await markDelivered(ctx(ops, at(date, "12:30")), d.id);
        delivered++;
      } else if (failOne && d.first_name === "Natnael") {
        await markFailed(ctx(rider, when), d.id, "Not home");
        failed++;
      } else {
        await markDelivered(ctx(rider, when), d.id);
        delivered++;
      }
    }
    eqCheck(await n("select count(*)::int as n from delivery_drops where drop_date = $1 and status = 'pending'", [date]), 0, `${date}: no drop left pending (${delivered} delivered, ${failed} failed)`);
    dayReport.push({ date, meals: meals.length, labels: labels.length, clients: clientsToday, drops: drops.length, delivered, failed });
    line(`  ${date}: morning job ${JSON.stringify(morning)}`);
  }

  await step("Mon 26 Oct — service day, two quick starts, 18:00 quick-start lock", async () => {
    // community: coach announcement and a challenge for the week
    const ann = await createPost(ctx(dagi, at("2026-10-26", "08:00")), { type: "announcement", body: "New week, new menu! Water challenge starts today — 2 litres a day." });
    posts.announcement = ann.id;
    const ch = await createChallenge(ctx(dagi, at("2026-10-26", "08:05")), { title: "2 litres of water", question: "Did you drink 2 litres of water today?", startsOn: "2026-10-26", endsOn: "2026-10-31" });
    challengeId = ch.id;
    check(ann.id && ch.id, "Dagi posted an announcement and created the water challenge (26–31 Oct)");

    await serviceDay("2026-10-26", false);

    const r1 = await signUp(ctx(null, at("2026-10-26", "11:00")), qsInput("Meron", "0911400001"));
    const r2 = await signUp(ctx(null, at("2026-10-26", "12:00")), qsInput("Tsion", "0911400002"));
    for (const [r, who] of [[r1, "first"], [r2, "second"]] as const) {
      if (r.plan.status !== "created") throw new Error(`quick start ${who}: plan ${JSON.stringify(r.plan)}`);
      qs[who] = { id: r.clientId, userId: r.userId, amount: r.plan.amountBirr };
      eqCheck(r.plan.startDate, "2026-10-27", `quick start ${who}: start Tuesday 27 Oct if paid by 18:00`);
    }
    const [sub1] = await q<{ price_day_birr: number; price_breakdown: { priceDay?: number } | null; quick_start_period_end: string }>(
      "select price_day_birr, price_breakdown, quick_start_period_end::text from subscriptions where client_id = $1", [qs.first.id]);
    const priceDay = sub1.price_breakdown?.priceDay ?? sub1.price_day_birr;
    eqCheck(sub1.quick_start_period_end, "2026-11-01", "quick-start period ends Sunday 1 Nov (Monday sign-up)");
    eqCheck(qs.first.amount, round10(priceDay * 5), `quick-start invoice = price per day ${priceDay.toFixed(2)} × 5 service days, nearest 10`);
    summary["Quick-start price per day"] = birr(priceDay);

    const a1 = await loadActor(db, qs.first.userId);
    const a2 = await loadActor(db, qs.second.userId);
    const inv1 = await issuedInvoice(qs.first.id, "2026-10-27");
    const inv2 = await issuedInvoice(qs.second.id, "2026-10-27");
    await uploadReceipt(ctx(a1, at("2026-10-26", "17:25")), { invoiceId: inv1.id, method: "telebirr", reference: "TBQS0001", receipt: receipt() });
    await confirmPayment(ctx(ops, at("2026-10-26", "17:30")), (await pendingPayment(inv1.id)).id);
    await uploadReceipt(ctx(a2, at("2026-10-26", "17:50")), { invoiceId: inv2.id, method: "cbe", reference: "FTQS0002", receipt: receipt() });

    const lock = await job("daily-quick-start", new Date(at("2026-10-26", "18:00").getTime() + 5000));
    line(`Quick-start lock 18:00: ${JSON.stringify(lock)}`);
    line();
    eqCheck(lock.added, 1, "quick starts added at 18:00 (only the one paid by then)");
    await confirmPayment(ctx(ops, at("2026-10-26", "18:30")), (await pendingPayment(inv2.id)).id);

    const meals1 = await n("select count(*)::int as n from order_meals where client_id = $1 and cook_date = '2026-10-27'", [qs.first.id]);
    const meals2 = await n("select count(*)::int as n from order_meals where client_id = $1", [qs.second.id]);
    eqCheck(meals1, 4, "first quick start is on Tuesday's production sheet (4 meals)");
    eqCheck(meals2, 0, "second quick start (confirmed 18:30) is not");

    // ratings and weigh-ins on Monday evening
    const lunch = await q<{ meal_id: string }>(`select m.meal_id from order_meals m join order_days d on d.id = m.order_day_id
      where m.client_id = $1 and d.service_date = '2026-10-26' and m.slot = 'lunch'`, [abel.c.id]);
    const mealId = lunch[0].meal_id;
    posts.ratedMeal = mealId;
    for (const [who, rating] of [[abel, 5], [sara, 4], [natnael, 3]] as const) {
      await rateMeal(ctx(who.actor, at("2026-10-26", "20:00")), { mealId, serviceDate: "2026-10-26", rating, comment: rating === 3 ? "A bit dry" : null });
    }
    for (const [who, kg] of [[abel, 90.2], [sara, 66.4], [natnael, 84.9]] as const) {
      await logWeight(ctx(who.actor, at("2026-10-26", "21:00")), { weightKg: kg });
    }
    eqCheck(await n("select count(*)::int as n from checkins where checkin_date = '2026-10-26' and source = 'client'"), 3, "clients logged weight (Abel, Sara, Natnael)");
  });

  const checkInPlan: Record<string, string[]> = {
    "2026-10-26": ["Abel", "Sara"],
    "2026-10-27": ["Abel", "Natnael"],
    "2026-10-28": ["Abel", "Sara"],
    "2026-10-29": ["Abel", "Sara"],
  };
  const byFirst: Record<string, typeof abel> = { Abel: abel, Sara: sara, Natnael: natnael };
  async function challengeCheckins(date: string) {
    for (const first of checkInPlan[date] ?? []) await checkInChallenge(ctx(byFirst[first].actor, at(date, "21:30")), challengeId);
  }

  await step("Mon 26 Oct 21:30 — community: posts, reactions, comments, challenge check-ins", async () => {
    const prog = await createPost(ctx(abel.actor, at("2026-10-26", "21:15")), { type: "progress", body: "Down again this week. The chicken swap works for me!", shareProgress: true });
    const qn = await createPost(ctx(sara.actor, at("2026-10-26", "21:20")), { type: "question", body: "Coaches: is the savory snack OK before a run?" });
    posts.progress = prog.id;
    await react(ctx(sara.actor, at("2026-10-26", "21:25")), prog.id, "fire");
    await react(ctx(natnael.actor, at("2026-10-26", "21:26")), prog.id, "strong");
    await react(ctx(abel.actor, at("2026-10-26", "21:27")), posts.announcement, "like");
    await addComment(ctx(natnael.actor, at("2026-10-26", "21:28")), { postId: prog.id, body: "Great work Abel!" });
    await addComment(ctx(dagi, at("2026-10-26", "21:40")), { postId: qn.id, body: "Yes — eat it 60–90 minutes before." });
    const [p] = await q<{ progress: { kgChange: number; weeks: number } | null }>("select progress from community_posts where id = $1", [prog.id]);
    check(p.progress && Number.isFinite(p.progress.kgChange), `progress post shares Abel's own numbers: ${JSON.stringify(p.progress)}`);
    eqCheck(await n("select count(*)::int as n from community_reactions where post_id = $1", [prog.id]), 2, "reactions on the progress post");
    eqCheck(await n("select count(*)::int as n from community_comments where post_id in ($1, $2)", [prog.id, qn.id]), 2, "comments");
    await challengeCheckins("2026-10-26");
  });

  for (const [i, date] of DAYS.slice(1).entries()) {
    await step(`${["Tue 27", "Wed 28", "Thu 29", "Fri 30", "Sat 31"][i]} Oct — service day`, async () => {
      await serviceDay(date, date === "2026-10-28");
      if (date === "2026-10-27") {
        const prod = await productionForDate(ctx(kitchen, at(date, "06:30")), date);
        eqCheck(prod.quickStartClients, 1, "Tuesday's production sheet has 1 quick-start client");
        const lock = await job("daily-quick-start", new Date(at(date, "18:00").getTime() + 5000));
        line(`Quick-start lock Tue 18:00: ${JSON.stringify(lock)}`);
        line();
        const subs = await q<{ client_id: string; start_date: string }>("select client_id, start_date::text from subscriptions where client_id in ($1, $2)", [qs.first.id, qs.second.id]);
        eqCheck(subs.find((x) => x.client_id === qs.first.id)?.start_date, "2026-10-27", "first quick start began Tuesday 27 Oct");
        eqCheck(subs.find((x) => x.client_id === qs.second.id)?.start_date, "2026-10-28", "second quick start moved to Wednesday 28 Oct (D019)");
        const [inv2] = await q<{ service_days: number; amount_birr: number; status: string; period_start: string }>(
          "select service_days, amount_birr, status, period_start::text from invoices where client_id = $1 and kind = 'quick_start'", [qs.second.id]);
        const [sub2] = await q<{ price_day_birr: number; price_breakdown: { priceDay?: number } | null }>("select price_day_birr, price_breakdown from subscriptions where client_id = $1", [qs.second.id]);
        const priceDay = sub2.price_breakdown?.priceDay ?? sub2.price_day_birr;
        eqCheck({ start: inv2.period_start, days: inv2.service_days, amount: inv2.amount_birr, status: inv2.status },
          { start: "2026-10-28", days: 4, amount: qs.second.amount, status: "paid" }, "second quick-start invoice (paid amount kept, 4 service days)");
        const credits = await q<{ amount_birr: number; reason: string }>("select amount_birr, reason from account_credits where client_id = $1", [qs.second.id]);
        eqCheck(credits.map((c) => c.amount_birr), [qs.second.amount - round10(priceDay * 4)], `account credit = ${birr(qs.second.amount)} − round10(${priceDay.toFixed(2)} × 4)`);
        line(`Credit reason: ${credits[0]?.reason ?? "none"}`);
        line();
        eqCheck(await n("select count(*)::int as n from order_meals where client_id = $1 and cook_date = '2026-10-28'", [qs.second.id]), 4, "second quick start on Wednesday's production sheet");
        summary["Quick starts"] = `${birr(qs.first.amount)} (Tue start) and ${birr(qs.second.amount)} (moved to Wed, credit ${birr(credits[0]?.amount_birr)})`;
      }
      if (date === "2026-10-30") {
        await logCheckin(ctx(hana, at(date, "15:00")), { clientId: abel.c.id, date, weightG: 90100, adherencePct: 95, notes: "Great adherence; keep the chicken swap." });
        eqCheck(await n("select count(*)::int as n from checkins where client_id = $1 and source = 'nutritionist' and checkin_date = $2", [abel.c.id, date]), 1, "nutritionist check-in note logged for Abel");
      }
      await challengeCheckins(date);
      if (date === "2026-10-29") {
        const d = await challengeDetail(ctx(abel.actor, at(date, "22:00")), challengeId);
        eqCheck({ streak: d.myStreak, days: d.myDays }, { streak: 4, days: 4 }, "Abel: streak 4, days 4");
        eqCheck(d.leaderboard.map((x) => [x.rank, x.days]), [[1, 4], [2, 3], [3, 1]], "leaderboard ranks and days (Abel 4, Sara 3, Natnael 1)");
        const sd = await challengeDetail(ctx(sara.actor, at(date, "22:00")), challengeId);
        eqCheck({ streak: sd.myStreak, days: sd.myDays }, { streak: 2, days: 3 }, "Sara: streak 2 (Wed–Thu), days 3");
        summary["Challenge leaderboard (Thu)"] = d.leaderboard.map((x) => `${x.name} ${x.days}`).join(", ");
      }
    });
  }

  await step("Daily kitchen and delivery totals", async () => {
    line("| Cook date | Meals | Labels | Clients | Drops | Delivered | Failed |");
    line("|---|---|---|---|---|---|---|");
    for (const d of dayReport) line(`| ${d.date} | ${d.meals} | ${d.labels} | ${d.clients} | ${d.drops} | ${d.delivered} | ${d.failed} |`);
    line();
    eqCheck(dayReport.length, 6, "service days simulated");
    eqCheck(dayReport.reduce((a, d) => a + d.failed, 0), 1, "failed drops in the week");
    const [f] = await q<{ failed_reason: string }>("select failed_reason from delivery_drops where status = 'failed'");
    eqCheck(f?.failed_reason, "Not home", "failed drop reason");
    summary["Meals cooked Mon–Sat"] = dayReport.reduce((a, d) => a + d.meals, 0);
  });

  // -------------------------------------------------------------------------------------------------------------
  await step("Sat 31 Oct 22:00 — owner dashboard", async () => {
    const now = at("2026-10-31", "22:00");
    const dash = await ownerDashboard(ctx(owner, now));
    const k = dash.kpis;
    const due = await q<{ status: string; on_time: boolean }>(
      `select status, (status = 'delivered' and delivered_at <= (drop_date::timestamp + time '12:00') at time zone 'Africa/Addis_Ababa') as on_time
       from delivery_drops where kind = 'delivery' and drop_date between '2026-10-01' and '2026-10-31'`);
    const expectedOnTime = due.filter((d) => d.on_time).length / due.length;
    line("The rider marks about two drops an hour from 08:10, so on busy days the last drops land after the 12:00 deadline;");
    line("those and the one failed drop are what keeps on-time below 100%.");
    line();
    check(k.onTimePct != null && Math.abs(k.onTimePct - expectedOnTime) < 1e-9, `on-time % = ${((k.onTimePct ?? NaN) * 100).toFixed(1)}% (expected ${(expectedOnTime * 100).toFixed(1)}%, ${due.length} delivery drops)`);
    const rated = dash.ratings.find((r) => r.mealId === posts.ratedMeal);
    eqCheck(rated ? { avg: rated.avg, count: rated.count } : null, { avg: 4, count: 3 }, `average rating for "${rated?.meal?.name ?? "?"}"`);
    const [purch] = await q<{ total: number }>("select coalesce(sum(total_price_birr), 0)::int as total from purchases where purchased_on between '2026-10-01' and '2026-10-31'");
    eqCheck(k.foodCost, purch.total, "food cost = purchases this month");
    eqCheck(k.quickStartsThisWeek, 2, "quick starts this week");
    const finite = Object.entries(k).filter(([key]) => key !== "churnRate").every(([, v]) => v === null ? false : Number.isFinite(v as number));
    check(finite, "every KPI is a finite number");
    line();
    line("| KPI | Value |");
    line("|---|---|");
    line(`| Active clients | ${k.activeClients} |`);
    line(`| New this month | ${k.newThisMonth} |`);
    line(`| MRR | ${birr(k.mrr)} |`);
    line(`| Invoiced (October) | ${birr(k.invoiced)} |`);
    line(`| Collected (October) | ${birr(k.collected)} (${k.invoiced ? Math.round((k.collected / k.invoiced) * 100) : 0}% of invoiced) |`);
    line(`| Food cost | ${birr(k.foodCost)} (${k.foodCostPct == null ? "—" : (k.foodCostPct * 100).toFixed(1) + "%"} of collected) |`);
    line(`| Delivery cost | ${birr(k.deliveryCost)} |`);
    line(`| Margin estimate | ${birr(k.marginEstimate)} |`);
    line(`| On-time delivery | ${k.onTimePct == null ? "—" : (k.onTimePct * 100).toFixed(1) + "%"} |`);
    line(`| Quick starts this week | ${k.quickStartsThisWeek} |`);
    line(`| Clients needing attention | ${dash.attention.length}: ${dash.attention.map((a) => `${a.firstName} (${(a as { reasons?: string[]; reason?: string }).reasons?.join("/") ?? (a as { reason?: string }).reason ?? "?"})`).join(", ")} |`);
    line();
    line("Next week's invoices (week of 2 Nov, due Thu 29 Oct 18:00) are not paid in this simulation, so those clients show as \"unpaid\".");
    summary["Active clients"] = k.activeClients;
    summary["MRR"] = birr(k.mrr);
    summary["Collected / invoiced"] = `${birr(k.collected)} / ${birr(k.invoiced)}`;
    summary["Food cost %"] = k.foodCostPct == null ? "—" : `${(k.foodCostPct * 100).toFixed(1)}%`;
    summary["Margin estimate"] = birr(k.marginEstimate);
    summary["On-time delivery"] = k.onTimePct == null ? "—" : `${(k.onTimePct * 100).toFixed(1)}%`;
    summary["Quick starts this week"] = k.quickStartsThisWeek;
  });

  // -------------------------------------------------------------------------------------------------------------
  const body = report.slice();
  report.length = 0;
  line(body[0]);
  line();
  line(`**Result: ${failures.length === 0 ? "PASS" : `FAIL (${failures.length} assertion${failures.length === 1 ? "" : "s"})`}** · ${new Date().toISOString().slice(0, 10)} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  line();
  line("| Summary | |");
  line("|---|---|");
  for (const [key, v] of Object.entries(summary)) line(`| ${key} | ${v} |`);
  if (failures.length) {
    line();
    line("### Failures");
    line();
    for (const f of failures) line(`- ${f}`);
  }
  report.push(...body.slice(1));
  const text = report.join("\n") + "\n";
  writeFileSync(path.resolve("docs/simulation-report.md"), text);
  console.log(text);
}

main()
  .catch((e) => {
    console.error(e);
    failures.push(`fatal: ${e instanceof Error ? e.message : String(e)}`);
  })
  .finally(async () => {
    await sql.end({ timeout: 5 });
    const shared = (globalThis as unknown as { __qmDb?: { sql: { end: (o: { timeout: number }) => Promise<void> } } }).__qmDb;
    if (shared) await shared.sql.end({ timeout: 5 });
    if (failures.length) {
      console.error(`\nsimulate:week FAILED (${failures.length}):\n- ${failures.join("\n- ")}`);
      process.exit(1);
    }
    console.log("simulate:week PASSED");
    process.exit(0);
  });
