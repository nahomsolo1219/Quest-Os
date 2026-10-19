import { describe, expect, it } from "vitest";
import { buildOrderDays, lockWeek, type LockClient } from "./orders";
import { quickStartPlan } from "./schedule";
import { DEFAULT_SCHEDULE } from "./settings";
import { client, DATA, SETTINGS } from "./test-fixtures";
import { addisInstant } from "./time";

const WEEK = "2026-10-26";

describe("lockWeek", () => {
  const clients: LockClient[] = [
    client("paid"),
    client("unpaid", { paidInvoices: [{ periodStart: "2026-10-26", periodEnd: "2026-11-01", status: "issued" }] }),
    client("paused", { pauses: [{ startWeek: "2026-10-26", weeks: 1 }] }),
    client("partial", { paidInvoices: [{ periodStart: "2026-10-26", periodEnd: "2026-10-28", status: "paid" }] }),
    client("ended-before", { subscription: { id: "s", status: "active", startDate: "2026-09-01", endDate: "2026-10-25" } }),
    client("starts-after", { subscription: { id: "s", status: "active", startDate: "2026-11-02", endDate: "2026-12-01" } }),
    client("cancelled", { subscription: { id: "s", status: "cancelled", startDate: "2026-10-01", endDate: "2026-12-31" } }),
    client("ends-wed", { subscription: { id: "s", status: "active", startDate: "2026-10-01", endDate: "2026-10-28" } }),
  ];
  const { orders, summary } = lockWeek({ weekStart: WEEK, clients, data: DATA, settings: SETTINGS });
  const byId = (id: string) => orders.find((o) => o.clientId === id);

  it("locks paid clients with 7 menu days of 4 meals", () => {
    const o = byId("paid")!;
    expect(o.status).toBe("locked");
    expect(o.days).toHaveLength(7);
    expect(o.days.every((d) => d.meals.length === 4)).toBe(true);
    expect(o.days.map((d) => d.menu).join("")).toBe("ABCDABC");
    expect(o.days[6]).toMatchObject({ serviceDate: "2026-11-01", cookDate: "2026-10-31", dropDate: "2026-10-31" });
    expect(o.days[0].meals.map((m) => m.slot)).toEqual(["breakfast", "lunch", "dinner", "snack"]);
  });

  it("skips unpaid, marks paused, cooks only covered days", () => {
    expect(byId("unpaid")).toMatchObject({ status: "skipped_unpaid", days: [] });
    expect(byId("paused")).toMatchObject({ status: "paused", days: [] });
    expect(byId("partial")!.days.map((d) => d.serviceDate)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(byId("ends-wed")!.days).toHaveLength(3);
  });

  it("leaves out subscriptions that miss the week", () => {
    expect(byId("ended-before")).toBeUndefined();
    expect(byId("starts-after")).toBeUndefined();
    expect(byId("cancelled")).toBeUndefined();
    expect(summary).toEqual({ locked: 3, skippedUnpaid: 1, paused: 1, meals: (7 + 3 + 3) * 4 });
  });

  it("does not rebuild days that already have an order (quick start)", () => {
    const r = lockWeek({
      weekStart: WEEK,
      clients: [
        client("qs-all", { existingServiceDates: ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"] }),
        client("qs-some", { existingServiceDates: ["2026-10-26"] }),
      ],
      data: DATA,
      settings: SETTINGS,
    });
    expect(r.orders.map((o) => o.clientId)).toEqual(["qs-some"]);
    expect(r.orders[0].days).toHaveLength(6);
  });

  it("meals carry profile portions, rounded macros, eat-by dates", () => {
    const o = byId("paid")!;
    const mon = o.days[0];
    const lunch = mon.meals[1];
    expect(lunch.mealCode).toBe("A_LUNCH");
    expect(lunch.items[0].qty).toBe(DATA.portions.M_LEAN!["A_LUNCH:0"]);
    expect(Number.isInteger(lunch.kcal)).toBe(true);
    expect(lunch.eatBy).toBe("2026-10-29"); // cook + 3
    const thuDinner = o.days[3].meals[2]; // tilapia
    expect(thuDinner.mealCode).toBe("D_DINNER");
    expect(thuDinner.eatBy).toBe("2026-10-31"); // cook + 2
    const wedLunch = o.days[2].meals[1]; // injera
    expect(wedLunch.eatBy).toBe("2026-10-30");
    const sunLunch = o.days[6].meals[1]; // cooked Saturday
    expect(sunLunch.cookDate).toBe("2026-10-31");
    expect(sunLunch.eatBy).toBe("2026-11-02");
  });

  it("applies swaps and add-ons and reports conflicts left after swaps", () => {
    const r = lockWeek({
      weekStart: WEEK,
      clients: [
        client("nut", { allergies: ["peanut"] }),
        client("nut-swapped", { allergies: ["peanut"], swapRuleIds: ["PEANUT_TO_AYIB"] }),
        client("fish", { allergies: ["fish"], swapRuleIds: ["TILAPIA_TO_CHICKEN", "SWEET_TO_SAVORY_SNACK"], addons: [{ kind: "extra_protein", slot: "lunch" }] }),
      ],
      data: DATA,
      settings: SETTINGS,
    });
    const nut = r.orders[0].days.flatMap((d) => d.meals).filter((m) => m.conflicts.length);
    expect(nut.map((m) => m.mealCode)).toEqual(["A_BREAKFAST", "C_SNACK", "A_BREAKFAST", "C_SNACK"]);
    expect(nut[0].conflicts).toContain("Allergy: peanut (Peanut butter)");
    expect(r.orders[1].days.flatMap((d) => d.meals).some((m) => m.conflicts.length)).toBe(false);
    const fish = r.orders[2];
    const thu = fish.days[3];
    expect(thu.meals[2].items[0].ingredients[0].ingredientId).toBe("chicken-breast");
    expect(thu.meals[2].conflicts).toEqual([]);
    expect(thu.meals[2].eatBy).toBe("2026-11-01"); // no fish any more: + 3
    expect(fish.days.every((d) => d.meals[3].mealId === "SAVORY_SNACK")).toBe(true);
    expect(fish.days[0].meals[1].items.at(-1)!.source).toEqual({ kind: "addon", code: "extra_protein" });
  });

  it("every-3-days clients cook on the drop date", () => {
    const r = lockWeek({ weekStart: WEEK, clients: [client("e3", { deliveryOption: "every_3_days" })], data: DATA, settings: SETTINGS });
    expect(r.orders[0].days.map((d) => d.cookDate)).toEqual(["2026-10-26", "2026-10-26", "2026-10-26", "2026-10-29", "2026-10-29", "2026-10-29", "2026-10-31"]);
  });
});

describe("buildOrderDays for a quick start", () => {
  it("builds the quick-start period from the plan's meal dates", () => {
    const plan = quickStartPlan(addisInstant("2026-10-23", "09:00"), DEFAULT_SCHEDULE)!;
    const days = buildOrderDays(client("qs"), plan.mealDates, DATA, SETTINGS);
    expect(days).toHaveLength(9);
    expect(days[0]).toMatchObject({ serviceDate: "2026-10-24", menu: "B" });
    expect(days[1]).toMatchObject({ serviceDate: "2026-10-25", cookDate: "2026-10-24", menu: "C" });
  });
});
