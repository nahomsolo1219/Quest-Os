import { describe, expect, it } from "vitest";
import { DEFAULT_PRICING, DEFAULT_SCHEDULE as S } from "./settings";
import {
  applyPause, coveredDates, invoiceAmount, invoicePeriods, isPausedWeek, nextInvoiceToGenerate, nextInvoicesToGenerate, renewEndDate, subscriptionEndDate,
} from "./subscriptions";
import { addisInstant as at } from "./time";

describe("pauses (whole weeks, extend the plan)", () => {
  const now = at("2026-10-19", "10:00"); // next lockable week: 26 Oct
  it("a 2-week pause moves the end date by 14 days", () => {
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-26", 2, now, S)).toEqual({
      ok: true, startWeek: "2026-10-26", endWeek: "2026-11-08", weeks: 2, endDate: "2026-12-02",
    });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-11-09", 1, now, S)).toMatchObject({ ok: true, endDate: "2026-11-25" });
  });
  it("rejects partial weeks, non-Mondays, weeks already locked and weeks after the plan", () => {
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-26", 1.5, now, S)).toEqual({ ok: false, reason: "not_whole_weeks" });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-26", 0, now, S)).toEqual({ ok: false, reason: "not_whole_weeks" });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-27", 1, now, S)).toEqual({ ok: false, reason: "not_monday" });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-19", 1, now, S)).toEqual({ ok: false, reason: "after_cutoff" });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-26", 1, at("2026-10-22", "18:00"), S)).toEqual({ ok: false, reason: "after_cutoff" });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-10-26", 1, at("2026-10-22", "17:59"), S)).toMatchObject({ ok: true });
    expect(applyPause({ endDate: "2026-11-18" }, "2026-11-23", 1, now, S)).toEqual({ ok: false, reason: "after_end" });
  });
  it("knows paused weeks", () => {
    const pauses = [{ startWeek: "2026-10-26", weeks: 2 }];
    expect(isPausedWeek(pauses, "2026-10-26")).toBe(true);
    expect(isPausedWeek(pauses, "2026-11-04")).toBe(true);
    expect(isPausedWeek(pauses, "2026-11-09")).toBe(false);
    expect(isPausedWeek(pauses, "2026-10-19")).toBe(false);
  });
});

describe("billing periods", () => {
  it("weekly: Monday–Sunday, clipped to the subscription", () => {
    const p = invoicePeriods({ startDate: "2026-10-21", endDate: "2026-11-20", billingPeriod: "weekly" }, S);
    expect(p.map((x) => [x.start, x.end, x.serviceDays])).toEqual([
      ["2026-10-21", "2026-10-25", 4],
      ["2026-10-26", "2026-11-01", 6],
      ["2026-11-02", "2026-11-08", 6],
      ["2026-11-09", "2026-11-15", 6],
      ["2026-11-16", "2026-11-20", 5],
    ]);
    expect(p.every((x) => x.kind === "weekly" && !x.isFullMonth)).toBe(true);
    const window = invoicePeriods({ startDate: "2026-10-21", endDate: "2026-11-20", billingPeriod: "weekly" }, S, "2026-11-01", "2026-11-03");
    expect(window.map((x) => x.start)).toEqual(["2026-10-26", "2026-11-02"]);
  });

  it("monthly: one-month periods from the start date; the last one may be partial", () => {
    const p = invoicePeriods({ startDate: "2026-10-22", endDate: "2026-12-21", billingPeriod: "monthly" }, S);
    expect(p.map((x) => [x.start, x.end, x.isFullMonth])).toEqual([
      ["2026-10-22", "2026-11-21", true],
      ["2026-11-22", "2026-12-21", true],
    ]);
    const partial = invoicePeriods({ startDate: "2026-10-22", endDate: "2026-12-05", billingPeriod: "monthly" }, S);
    expect(partial[1]).toMatchObject({ start: "2026-11-22", end: "2026-12-05", isFullMonth: false, serviceDays: 12 });
  });

  it("amounts: full month = plan − discount; otherwise prorated by service days to the nearest 10", () => {
    const sub = { planPriceBirr: 58400, discountMonthBirr: 1000 };
    expect(invoiceAmount({ isFullMonth: true, serviceDays: 27 }, sub, DEFAULT_PRICING)).toBe(57400);
    expect(invoiceAmount({ isFullMonth: false, serviceDays: 6 }, sub, DEFAULT_PRICING)).toBe(13250); // 57,400 × 6 ÷ 26 = 13,246.15
    expect(invoiceAmount({ isFullMonth: false, serviceDays: 6 }, { planPriceBirr: 58400 }, DEFAULT_PRICING)).toBe(13480);
  });

  it("covered dates come from paid invoices only", () => {
    const inv = [
      { periodStart: "2026-10-26", periodEnd: "2026-11-01", status: "paid" as const },
      { periodStart: "2026-11-02", periodEnd: "2026-11-08", status: "issued" as const },
    ];
    const c = coveredDates(inv, ["2026-10-25", "2026-10-26", "2026-11-01", "2026-11-02"]);
    expect([...c]).toEqual(["2026-10-26", "2026-11-01"]);
  });

  it("the Thursday lock generates the period starting the week after next (and any missed one)", () => {
    const sub = { startDate: "2026-10-26", endDate: "2026-11-25", billingPeriod: "weekly" as const, planPriceBirr: 58400 };
    const existing = [
      { periodStart: "2026-10-26", periodEnd: "2026-11-01", status: "paid" as const, kind: "weekly" as const },
      { periodStart: "2026-11-02", periodEnd: "2026-11-08", status: "issued" as const, kind: "weekly" as const },
    ];
    const s = { schedule: S, pricing: DEFAULT_PRICING };
    const next = nextInvoicesToGenerate(sub, existing, "2026-11-02", s); // lock on Thu 29 Oct locks the week of 2 Nov
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ start: "2026-11-09", end: "2026-11-15", amountBirr: 13480 });
    expect(next[0].dueAt.toISOString()).toBe("2026-11-05T15:00:00.000Z");
    // run again with the new invoice present -> nothing
    expect(nextInvoiceToGenerate(sub, [...existing, { periodStart: "2026-11-09", periodEnd: "2026-11-15", status: "issued" }], "2026-11-02", s)).toBeNull();
    // a void invoice does not count
    const voided = nextInvoicesToGenerate(sub, [existing[0], { ...existing[1], status: "void" }], "2026-11-02", s);
    expect(voided.map((x) => x.start)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("regular billing starts after the quick-start period", () => {
    const sub = { startDate: "2026-10-24", endDate: "2026-11-23", billingPeriod: "weekly" as const, planPriceBirr: 58400, quickStartPeriodEnd: "2026-11-01" };
    const existing = [{ periodStart: "2026-10-24", periodEnd: "2026-11-01", status: "paid" as const, kind: "quick_start" as const }];
    const next = nextInvoicesToGenerate(sub, existing, "2026-11-02", { schedule: S, pricing: DEFAULT_PRICING });
    expect(next.map((x) => x.start)).toEqual(["2026-11-02", "2026-11-09"]);
  });

  it("term and renewal dates", () => {
    expect(subscriptionEndDate("2026-10-26", 1)).toBe("2026-11-25");
    expect(subscriptionEndDate("2026-10-26", 3)).toBe("2027-01-25");
    expect(renewEndDate("2026-11-25", 1)).toBe("2026-12-25");
  });
});

describe("invoices skip paused weeks (spec review)", () => {
  it("does not bill a paused week and prorates a month containing a pause", async () => {
    const { nextInvoicesToGenerate } = await import("./subscriptions");
    const { DEFAULT_SCHEDULE, DEFAULT_PRICING } = await import("./settings");
    const st = { schedule: DEFAULT_SCHEDULE, pricing: DEFAULT_PRICING };
    const weekly = nextInvoicesToGenerate({ startDate: "2026-10-12", endDate: "2026-11-18", billingPeriod: "weekly", planPriceBirr: 52000,
      pauses: [{ startWeek: "2026-11-02", weeks: 1 }] }, [], "2026-10-26", st);
    expect(weekly.map((i) => i.start)).toEqual(["2026-10-12", "2026-10-19", "2026-10-26"]);
    const monthly = nextInvoicesToGenerate({ startDate: "2026-10-26", endDate: "2026-12-02", billingPeriod: "monthly", planPriceBirr: 52000,
      pauses: [{ startWeek: "2026-11-02", weeks: 1 }] }, [], "2026-10-26", st);
    expect(monthly[0].isFullMonth).toBe(false);
    expect(monthly[0].serviceDays).toBe(27 - 6);
    expect(monthly[0].amountBirr).toBe(Math.round((52000 * 21) / 26 / 10) * 10);
  });
});

describe("periods lengthened after billing bill the remainder (final review)", () => {
  const st = async () => {
    const { DEFAULT_SCHEDULE, DEFAULT_PRICING } = await import("./settings");
    return { schedule: DEFAULT_SCHEDULE, pricing: DEFAULT_PRICING };
  };
  it("weekly: a renewal after the clipped last week was billed bills the rest of that week", async () => {
    const sub = { startDate: "2026-10-26", endDate: "2026-12-25", billingPeriod: "weekly" as const, planPriceBirr: 58400 };
    const existing = [{ periodStart: "2026-11-23", periodEnd: "2026-11-25", status: "paid" as const, kind: "weekly" as const }];
    const next = nextInvoicesToGenerate(sub, existing, "2026-11-23", await st()).filter((x) => x.start >= "2026-11-23");
    expect(next[0]).toMatchObject({ start: "2026-11-26", end: "2026-11-29", isFullMonth: false });
    expect(next[0].serviceDays).toBe(3); // Thu, Fri, Sat (Sunday is not a service day)
    expect(next.map((x) => x.start)).toEqual(["2026-11-26", "2026-11-30"]);
    // once billed, nothing more for that week
    const again = nextInvoicesToGenerate(sub, [...existing, { periodStart: "2026-11-26", periodEnd: "2026-11-29", status: "issued", kind: "weekly" }], "2026-11-23", await st()).filter((x) => x.start >= "2026-11-23");
    expect(again.map((x) => x.start)).toEqual(["2026-11-30"]);
  });

  it("monthly: pause then renewal bills the month's remainder after the pause-extension invoice", async () => {
    const sub = { startDate: "2026-10-26", endDate: "2027-01-02", billingPeriod: "monthly" as const, planPriceBirr: 52000 };
    const existing = [
      { periodStart: "2026-10-26", periodEnd: "2026-11-25", status: "paid" as const, kind: "monthly" as const },
      { periodStart: "2026-11-26", periodEnd: "2026-12-02", status: "paid" as const, kind: "monthly" as const },
    ];
    const next = nextInvoicesToGenerate(sub, existing, "2026-11-30", await st());
    expect(next[0]).toMatchObject({ start: "2026-12-03", end: "2026-12-25", isFullMonth: false });
  });
});

describe("re-billing after a void never bills a day twice (final review)", () => {
  it("a voided short period is not re-billed over a live remainder invoice", async () => {
    const { DEFAULT_SCHEDULE, DEFAULT_PRICING } = await import("./settings");
    const st = { schedule: DEFAULT_SCHEDULE, pricing: DEFAULT_PRICING };
    const sub = { startDate: "2026-10-21", endDate: "2027-01-03", billingPeriod: "monthly" as const, planPriceBirr: 52000, quickStartPeriodEnd: "2026-10-25",
      pauses: [{ startWeek: "2026-11-02", weeks: 1 }, { startWeek: "2026-11-23", weeks: 1 }] };
    const existing = [
      { periodStart: "2026-10-21", periodEnd: "2026-10-25", status: "paid" as const, kind: "quick_start" as const },
      { periodStart: "2026-10-26", periodEnd: "2026-11-25", status: "paid" as const, kind: "monthly" as const },
      { periodStart: "2026-11-26", periodEnd: "2026-11-27", status: "void" as const, kind: "monthly" as const },
      { periodStart: "2026-11-28", periodEnd: "2026-12-25", status: "issued" as const, kind: "monthly" as const },
    ];
    const next = nextInvoicesToGenerate(sub, existing, "2026-11-23", st);
    expect(next.filter((x) => x.start <= "2026-12-25" && x.end >= "2026-11-28")).toEqual([]);
    expect(next).toEqual([]); // 26–27 Nov are paused, so nothing at all is due
    // the next period starts after the live remainder: only its own days
    const later = nextInvoicesToGenerate(sub, existing, "2026-12-21", st);
    expect(later.map((x) => [x.start, x.end])).toEqual([["2026-12-26", "2027-01-03"]]);
  });
});
