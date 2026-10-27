import { afterAll, describe, expect, it } from "vitest";
import * as types from "../../src/domain/types";
import { testDb } from "./helpers";

const { sql } = testDb();
afterAll(() => sql.end({ timeout: 5 }));

const PLAN_TABLES = [
  "user", "session", "account", "verification",
  "settings", "audit_log", "areas", "clients", "consultations", "nutrition_profiles",
  "ingredients", "ingredient_prices", "meals", "parts", "part_ingredients", "profile_portions", "profile_day_results",
  "swap_rules", "client_swaps", "client_addons",
  "packages", "subscriptions", "pauses", "invoices", "payments", "account_credits",
  "weekly_orders", "order_days", "order_meals", "purchases", "stock_counts", "waste_log",
  "delivery_drops", "checkins", "partner_contributions", "notifications", "job_runs", "telegram_links",
  "community_posts", "community_comments", "community_reactions", "challenges", "challenge_checkins",
  "meal_ratings", "community_reports", "community_mutes",
];

/** Added after PLAN section 3 (staff tour milestone): per-user tour progress, keyed by (user_id, tour_id). */
const TOUR_TABLES = ["tour_progress"];

const DEMO_TABLES = [
  "user", "clients", "subscriptions", "invoices", "payments", "weekly_orders", "checkins", "community_posts",
  "partner_contributions", "purchases", "stock_counts",
];

describe("schema", () => {
  it("has every PLAN table", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
    const names = rows.map((r) => r.table_name).sort();
    expect(names).toEqual([...PLAN_TABLES, ...TOUR_TABLES].sort());
  });

  it("uses uuid primary keys (settings keyed by text)", async () => {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string; column_default: string | null }[]>`
      select c.table_name, c.column_name, c.data_type, c.column_default
      from information_schema.table_constraints tc
      join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
      join information_schema.columns c on c.table_schema = k.table_schema and c.table_name = k.table_name and c.column_name = k.column_name
      where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'`;
    const tour = rows.filter((r) => r.table_name === "tour_progress").map((r) => r.column_name).sort();
    expect(tour).toEqual(["tour_id", "user_id"]);
    const plan = rows.filter((r) => r.table_name !== "tour_progress");
    expect(plan).toHaveLength(PLAN_TABLES.length);
    for (const r of plan) {
      if (r.table_name === "settings") {
        expect(r).toMatchObject({ column_name: "key", data_type: "text" });
        continue;
      }
      expect(r.column_name, r.table_name).toBe("id");
      expect(r.data_type, r.table_name).toBe("uuid");
      expect(r.column_default, r.table_name).toContain("gen_random_uuid");
    }
  });

  it("stores money as integer birr", async () => {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and column_name like '%birr%'`;
    expect(rows.length).toBeGreaterThanOrEqual(14);
    for (const r of rows) expect(r.data_type, `${r.table_name}.${r.column_name}`).toBe("integer");
  });

  it("has created_at and updated_at as timestamptz on business tables", async () => {
    const rows = await sql<{ table_name: string; column_name: string; data_type: string }[]>`
      select table_name, column_name, data_type from information_schema.columns
      where table_schema = 'public' and column_name in ('created_at', 'updated_at')`;
    for (const t of PLAN_TABLES) {
      const created = rows.find((r) => r.table_name === t && r.column_name === "created_at");
      expect(created?.data_type, t).toBe("timestamp with time zone");
      if (t !== "audit_log" && t !== "job_runs") {
        expect(rows.find((r) => r.table_name === t && r.column_name === "updated_at")?.data_type, t).toBe("timestamp with time zone");
      }
    }
  });

  it("has is_demo on the demo tables", async () => {
    const rows = await sql<{ table_name: string }[]>`
      select table_name from information_schema.columns where table_schema = 'public' and column_name = 'is_demo'`;
    expect(rows.map((r) => r.table_name).sort()).toEqual([...DEMO_TABLES].sort());
  });

  it("defines every enum with the domain values", async () => {
    const rows = await sql<{ typname: string; labels: string[] }[]>`
      select t.typname, array_agg(e.enumlabel order by e.enumsortorder)::text[] as labels
      from pg_type t join pg_enum e on e.enumtypid = t.oid join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' group by t.typname`;
    const byName = Object.fromEntries(rows.map((r) => [r.typname, r.labels]));
    const expected: Record<string, readonly string[]> = {
      role: types.ROLES, client_status: types.CLIENT_STATUSES, lead_source: types.LEAD_SOURCES, sex: types.SEXES,
      activity: types.ACTIVITIES, goal: types.GOALS, size: types.SIZES, profile: types.PROFILES, food_group: types.FOOD_GROUPS,
      purchase_unit: types.PURCHASE_UNITS, part_category: types.PART_CATEGORIES, menu_code: types.MENU_CODES, slot: types.SLOTS,
      package_code: types.PACKAGE_CODES, delivery_option: types.DELIVERY_OPTIONS, billing_period: types.BILLING_PERIODS,
      subscription_status: types.SUBSCRIPTION_STATUSES, invoice_kind: types.INVOICE_KINDS, invoice_status: types.INVOICE_STATUSES,
      payment_method: types.PAYMENT_METHODS, payment_status: types.PAYMENT_STATUSES, order_status: types.ORDER_STATUSES,
      drop_status: types.DROP_STATUSES, swap_status: types.SWAP_STATUSES, contribution_type: types.CONTRIBUTION_TYPES,
      post_type: types.POST_TYPES, reaction: types.REACTIONS, report_status: types.REPORT_STATUSES,
    };
    expect(Object.keys(byName).sort()).toEqual(Object.keys(expected).sort());
    for (const [name, values] of Object.entries(expected)) expect(byName[name], name).toEqual([...values]);
  });

  it("has the idempotency unique constraints", async () => {
    const rows = await sql<{ indexdef: string }[]>`select indexdef from pg_indexes where schemaname = 'public' and indexdef like 'CREATE UNIQUE%'`;
    const defs = rows.map((r) => r.indexdef);
    const has = (table: string, cols: string) => defs.some((d) => d.includes(` ${table} `) && d.includes(`(${cols})`));
    expect(has("public.weekly_orders", "client_id, week_start")).toBe(true);
    expect(has("public.order_days", "client_id, service_date")).toBe(true);
    expect(has("public.invoices", "subscription_id, kind, period_start")).toBe(true);
    expect(has("public.job_runs", "job, run_key")).toBe(true);
    expect(has("public.notifications", "dedupe_key")).toBe(true);
    expect(has("public.stock_counts", "ingredient_id, count_date")).toBe(true);
    expect(has("public.profile_portions", "part_id, profile")).toBe(true);
    expect(has("public.community_reactions", "post_id, user_id")).toBe(true);
    expect(defs.some((d) => d.includes("delivery_drops") && d.includes("COALESCE(slot, 'all'::text)"))).toBe(true);
    expect(defs.some((d) => d.includes("nutrition_profiles") && d.includes("WHERE is_current"))).toBe(true);
  });

  it("rejects a second current nutrition profile", async () => {
    const [client] = await sql<{ id: string }[]>`select client_id as id from nutrition_profiles where is_current limit 1`;
    await expect(sql`
      insert into nutrition_profiles (client_id, bmr, tdee, suggested_kcal, suggested_size, suggested_protein_g, suggested_carb_g,
        suggested_fat_g, kcal_target, size, goal, protein_g, carb_g, fat_g, is_current)
      values (${client.id}, 1, 1, 1, 'S', 1, 1, 1, 1600, 'S', 'lean', 1, 1, 1, true)`).rejects.toThrow(/nutrition_profiles_one_current_uq/);
  });
});
