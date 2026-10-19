// Subscriptions: pauses, billing periods, invoice amounts and coverage (business rules 1 and 6, DECISIONS D021-D022).
import { periodAmount } from "./pricing";
import { nextLockableWeek, serviceDaysBetween, weeklyCutoff } from "./schedule";
import type { PricingSettings, ScheduleSettings } from "./settings";
import { addDays, addMonths, isoWeekday, maxDate, minDate, weekStartOf } from "./time";
import type { BillingPeriod, DateStr, InvoiceKind, InvoiceStatus } from "./types";

export type PauseResult =
  | { ok: true; startWeek: DateStr; endWeek: DateStr; weeks: number; endDate: DateStr }
  | { ok: false; reason: "not_monday" | "not_whole_weeks" | "after_cutoff" | "after_end" };

/**
 * Pauses are whole weeks starting on a Monday no earlier than the next lockable week; the plan's end date moves
 * by 7 × weeks days (paused days extend the plan, they are not refunded).
 */
export function applyPause(
  sub: { endDate: DateStr },
  startWeek: DateStr,
  weeks: number,
  now: Date,
  s: ScheduleSettings,
): PauseResult {
  if (!Number.isInteger(weeks) || weeks < 1) return { ok: false, reason: "not_whole_weeks" };
  if (isoWeekday(startWeek) !== 1) return { ok: false, reason: "not_monday" };
  if (startWeek < nextLockableWeek(now, s)) return { ok: false, reason: "after_cutoff" };
  if (startWeek > sub.endDate) return { ok: false, reason: "after_end" };
  return { ok: true, startWeek, endWeek: addDays(startWeek, 7 * weeks - 1), weeks, endDate: addDays(sub.endDate, 7 * weeks) };
}

export type Pause = { startWeek: DateStr; weeks: number };

export function isPausedWeek(pauses: Pause[], weekStart: DateStr): boolean {
  const w = weekStartOf(weekStart);
  return pauses.some((p) => w >= p.startWeek && w <= addDays(p.startWeek, 7 * (p.weeks - 1)));
}

export type BillingPeriodRange = {
  start: DateStr;
  end: DateStr;
  kind: Extract<InvoiceKind, "weekly" | "monthly">;
  /** a complete calendar month from the anchor (billed at the full monthly price) */
  isFullMonth: boolean;
  serviceDays: number;
};

/**
 * Billing periods of a subscription, clipped to [from, to] (default: the whole subscription).
 * weekly: Monday–Sunday weeks; monthly: one-month periods counted from the anchor date (start date, or the day
 * after a quick-start period), e.g. 22 Oct – 21 Nov (DECISIONS D105). The last period is clipped to the end date.
 */
export function invoicePeriods(
  sub: { startDate: DateStr; endDate: DateStr; billingPeriod: BillingPeriod; billingAnchor?: DateStr },
  s: ScheduleSettings,
  from?: DateStr,
  to?: DateStr,
): BillingPeriodRange[] {
  const anchor = sub.billingAnchor ?? sub.startDate;
  const lo = maxDate(anchor, from ?? anchor);
  const hi = minDate(sub.endDate, to ?? sub.endDate);
  const out: BillingPeriodRange[] = [];
  if (hi < lo) return out;
  if (sub.billingPeriod === "weekly") {
    for (let w = weekStartOf(anchor); w <= hi; w = addDays(w, 7)) {
      const ps = maxDate(w, anchor);
      const pe = minDate(addDays(w, 6), sub.endDate);
      if (pe < lo || ps > hi) continue;
      out.push({ start: ps, end: pe, kind: "weekly", isFullMonth: false, serviceDays: serviceDaysBetween(ps, pe, s).length });
    }
    return out;
  }
  for (let i = 0; ; i++) {
    const ps = addMonths(anchor, i);
    if (ps > hi) break;
    const fullEnd = addDays(addMonths(anchor, i + 1), -1);
    const pe = minDate(fullEnd, sub.endDate);
    if (pe < lo) continue;
    out.push({ start: ps, end: pe, kind: "monthly", isFullMonth: pe === fullEnd, serviceDays: serviceDaysBetween(ps, pe, s).length });
  }
  return out;
}

/** Amount for one period (D021): full month = plan − discount, otherwise prorated by service days, nearest 10. */
export function invoiceAmount(
  period: Pick<BillingPeriodRange, "isFullMonth" | "serviceDays">,
  sub: { planPriceBirr: number; discountMonthBirr?: number },
  s: Pick<PricingSettings, "serviceDaysPerMonth">,
): number {
  return periodAmount(
    { planPriceBirr: sub.planPriceBirr, discountMonthBirr: sub.discountMonthBirr ?? 0, serviceDays: period.serviceDays, isFullMonth: period.isFullMonth },
    s,
  );
}

export type InvoiceRange = { periodStart: DateStr; periodEnd: DateStr; status?: InvoiceStatus; kind?: InvoiceKind };

/** Dates covered by paid invoices (all given invoices count unless status says otherwise). */
export function coveredDates(paidInvoices: InvoiceRange[], dates: DateStr[]): Set<DateStr> {
  const paid = paidInvoices.filter((i) => i.status == null || i.status === "paid");
  return new Set(dates.filter((d) => paid.some((i) => d >= i.periodStart && d <= i.periodEnd)));
}

export type InvoiceDraft = BillingPeriodRange & { amountBirr: number; dueAt: Date };

/**
 * Invoices the Thursday lock should create for a subscription. The lock that locks `lockWeek` bills every
 * period starting no later than the end of the following week (the "week after next" from the lock's own week),
 * skipping periods that already have a non-void invoice with the same start or whose dates are fully covered
 * (e.g. by the quick-start invoice). Each is due at the cutoff of the week its period starts in.
 */
export function nextInvoicesToGenerate(
  sub: {
    startDate: DateStr;
    endDate: DateStr;
    billingPeriod: BillingPeriod;
    planPriceBirr: number;
    discountMonthBirr?: number;
    quickStartPeriodEnd?: DateStr | null;
  },
  existing: InvoiceRange[],
  lockWeek: DateStr,
  s: { schedule: ScheduleSettings; pricing: Pick<PricingSettings, "serviceDaysPerMonth"> },
): InvoiceDraft[] {
  const horizon = addDays(weekStartOf(lockWeek), 13); // Sunday of the week after the locked week
  const anchor = sub.quickStartPeriodEnd ? addDays(sub.quickStartPeriodEnd, 1) : sub.startDate;
  const live = existing.filter((i) => i.status !== "void");
  return invoicePeriods({ ...sub, billingAnchor: anchor }, s.schedule, undefined, horizon)
    .filter((p) => p.start <= horizon)
    .filter((p) => !live.some((i) => i.periodStart === p.start && (i.kind == null || i.kind === p.kind)))
    .filter((p) => {
      const days: DateStr[] = [];
      for (let d = p.start; d <= p.end; d = addDays(d, 1)) days.push(d);
      return coveredDates(live.map((i) => ({ ...i, status: undefined })), days).size < days.length;
    })
    .map((p) => ({ ...p, amountBirr: invoiceAmount(p, sub, s.pricing), dueAt: weeklyCutoff(weekStartOf(p.start), s.schedule) }));
}

/** Renewal: extend the end date by the term (months). */
export function renewEndDate(endDate: DateStr, termMonths: number): DateStr {
  return addDays(addMonths(addDays(endDate, 1), termMonths), -1);
}

/** End date of a new subscription: start + term months − 1 day. */
export function subscriptionEndDate(startDate: DateStr, termMonths: number): DateStr {
  return addDays(addMonths(startDate, termMonths), -1);
}

/** The earliest invoice the lock should create (null when nothing is due). */
export function nextInvoiceToGenerate(...args: Parameters<typeof nextInvoicesToGenerate>): InvoiceDraft | null {
  return nextInvoicesToGenerate(...args)[0] ?? null;
}
