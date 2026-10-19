import { describe, expect, it } from "vitest";
import { clientsNeedingAttention, dashboardKpis, mealRatingAverages, type KpiInput } from "./kpis";
import { DEFAULT_PRICING, DEFAULT_SCHEDULE } from "./settings";
import { addisInstant as at } from "./time";

const base: KpiInput = {
  month: "2026-10-19",
  today: "2026-10-21",
  clients: [
    { id: "a", status: "active", endedAt: null },
    { id: "b", status: "active", endedAt: null },
    { id: "c", status: "active", endedAt: null },
    { id: "d", status: "ended", endedAt: "2026-10-10" },
    { id: "e", status: "ended", endedAt: "2026-09-30" },
    { id: "f", status: "paused", endedAt: null },
  ],
  subscriptions: [
    { clientId: "a", status: "active", startDate: "2026-09-01", planPriceBirr: 58400, discountMonthBirr: 0, isQuickStart: false },
    { clientId: "b", status: "active", startDate: "2026-10-05", planPriceBirr: 54100, discountMonthBirr: 1000, isQuickStart: false },
    { clientId: "c", status: "active", startDate: "2026-10-20", planPriceBirr: 58400, discountMonthBirr: 0, isQuickStart: true },
    { clientId: "c", status: "pending_payment", startDate: "2026-10-26", planPriceBirr: 58400, discountMonthBirr: 0, isQuickStart: false },
    { clientId: "d", status: "ended", startDate: "2026-08-01", planPriceBirr: 58400, discountMonthBirr: 0, isQuickStart: false },
    { clientId: "f", status: "paused", startDate: "2026-08-01", planPriceBirr: 58400, discountMonthBirr: 0, isQuickStart: false },
  ],
  invoices: [
    { amountBirr: 58400, status: "paid", issuedOn: "2026-10-01" },
    { amountBirr: 13480, status: "issued", issuedOn: "2026-10-15" },
    { amountBirr: 9000, status: "void", issuedOn: "2026-10-15" },
    { amountBirr: 50000, status: "paid", issuedOn: "2026-09-28" },
  ],
  payments: [
    { amountBirr: 58400, status: "confirmed", confirmedOn: "2026-10-02" },
    { amountBirr: 53100, status: "confirmed", confirmedOn: "2026-10-06" },
    { amountBirr: 5000, status: "submitted", confirmedOn: null },
    { amountBirr: 50000, status: "confirmed", confirmedOn: "2026-09-29" },
  ],
  purchases: [
    { totalPriceBirr: 30000, purchasedOn: "2026-10-03" },
    { totalPriceBirr: 12000, purchasedOn: "2026-10-17" },
    { totalPriceBirr: 9999, purchasedOn: "2026-09-30" },
  ],
  drops: [
    { dropDate: "2026-10-20", status: "delivered", kind: "delivery", deliveredAt: at("2026-10-20", "11:30") },
    { dropDate: "2026-10-20", status: "delivered", kind: "delivery", deliveredAt: at("2026-10-20", "12:30") },
    { dropDate: "2026-10-21", status: "failed", kind: "delivery", deliveredAt: null },
    { dropDate: "2026-10-21", status: "delivered", kind: "delivery", deliveredAt: at("2026-10-21", "12:00") },
    { dropDate: "2026-10-21", status: "delivered", kind: "pickup", deliveredAt: at("2026-10-21", "15:00") },
    { dropDate: "2026-10-22", status: "pending", kind: "delivery", deliveredAt: null },
  ],
  pricing: DEFAULT_PRICING,
  schedule: DEFAULT_SCHEDULE,
};

describe("dashboard KPIs", () => {
  const k = dashboardKpis(base);
  it("counts clients, new and churned", () => {
    expect(k.activeClients).toBe(3);
    expect(k.newThisMonth).toBe(2); // b and c start in October
    expect(k.churnedThisMonth).toBe(1); // d
    expect(k.churnRate).toBeCloseTo(1 / 2, 9); // active at start = 3 + 1 − 2
  });
  it("MRR = plan price − discount of active (non-quick-start) subscriptions", () => {
    expect(k.mrr).toBe(58400 + 54100 - 1000);
  });
  it("invoiced vs collected, food cost and its share", () => {
    expect(k.invoiced).toBe(58400 + 13480);
    expect(k.collected).toBe(58400 + 53100);
    expect(k.foodCost).toBe(42000);
    expect(k.foodCostPct).toBeCloseTo(42000 / 111500, 9);
  });
  it("margin estimate = collected − food − fixed − consult × active − delivery", () => {
    expect(k.deliveryCost).toBe(5 * 150);
    expect(k.marginEstimate).toBe(111500 - 42000 - 38000 - 2200 * 3 - 750);
  });
  it("on-time = delivered on the day by 12:00 among delivery drops due so far", () => {
    expect(k.onTimePct).toBeCloseTo(2 / 4, 9);
  });
  it("quick starts this week", () => {
    expect(k.quickStartsThisWeek).toBe(1);
  });
  it("handles an empty month", () => {
    const e = dashboardKpis({ ...base, clients: [], subscriptions: [], invoices: [], payments: [], purchases: [], drops: [] });
    expect(e).toMatchObject({ activeClients: 0, churnRate: 0, mrr: 0, foodCostPct: null, onTimePct: null, marginEstimate: -38000 });
  });
});

describe("meal ratings", () => {
  it("averages the last 4 weeks per meal", () => {
    const r = mealRatingAverages(
      [
        { mealId: "A_LUNCH", serviceDate: "2026-10-20", rating: 5 },
        { mealId: "A_LUNCH", serviceDate: "2026-10-01", rating: 4 },
        { mealId: "A_LUNCH", serviceDate: "2026-09-23", rating: 4 }, // today − 28: outside
        { mealId: "B_LUNCH", serviceDate: "2026-10-21", rating: 3 },
        { mealId: "B_LUNCH", serviceDate: "2026-10-22", rating: 1 }, // future
      ],
      "2026-10-21",
    );
    expect(r).toEqual([
      { mealId: "A_LUNCH", avg: 4.5, count: 2 },
      { mealId: "B_LUNCH", avg: 3, count: 1 },
    ]);
  });
});

describe("clients needing attention", () => {
  it("flags unpaid past-due invoices, conflicts and missing check-ins", () => {
    const r = clientsNeedingAttention({
      now: at("2026-10-23", "10:00"),
      today: "2026-10-23",
      clients: [
        { clientId: "a", activeSince: "2026-09-01" },
        { clientId: "b", activeSince: "2026-10-20" },
        { clientId: "c", activeSince: "2026-09-01" },
      ],
      invoices: [
        { clientId: "a", status: "issued", dueAt: at("2026-10-22", "18:00") },
        { clientId: "b", status: "issued", dueAt: at("2026-10-29", "18:00") },
        { clientId: "c", status: "paid", dueAt: at("2026-10-22", "18:00") },
      ],
      currentOrderConflicts: [{ clientId: "b", conflicts: ["Allergy: peanut (Peanut butter)"] }],
      lastCheckins: { a: "2026-10-20", c: "2026-10-09" },
    });
    expect(r).toEqual([
      { clientId: "a", reasons: ["unpaid"] },
      { clientId: "b", reasons: ["allergy_conflict"] },
      { clientId: "c", reasons: ["no_checkin_2w"] },
    ]);
  });
});
