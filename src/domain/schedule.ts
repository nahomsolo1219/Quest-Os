// Rotation, service days, the weekly cutoff, quick start and drops (PLAN section 7, DECISIONS D015-D018).
import type { ScheduleSettings } from "./settings";
import { addDays, addisDate, addisInstant, isoWeekday, weekStartOf } from "./time";
import type { DateStr, DeliveryOption, MenuCode } from "./types";

export function menuForDate(date: DateStr, s: ScheduleSettings): MenuCode {
  return s.rotation[isoWeekday(date)];
}

export function isServiceDay(date: DateStr, s: ScheduleSettings): boolean {
  return s.serviceDays.includes(isoWeekday(date));
}

/** First service day strictly after date (null if the schedule has no service days). */
export function nextServiceDay(date: DateStr, s: ScheduleSettings): DateStr | null {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, i);
    if (isServiceDay(d, s)) return d;
  }
  return null;
}

/** Service days in [start, end] inclusive. */
export function serviceDaysBetween(start: DateStr, end: DateStr, s: ScheduleSettings): DateStr[] {
  const out: DateStr[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isServiceDay(d, s)) out.push(d);
  return out;
}

/** The weekly cutoff that locks weekStart: Thursday (weeklyCutoffWeekday) 18:00 Addis of the week BEFORE. */
export function weeklyCutoff(weekStart: DateStr, s: ScheduleSettings): Date {
  const prevMonday = addDays(weekStartOf(weekStart), -7);
  return addisInstant(addDays(prevMonday, s.weeklyCutoffWeekday - 1), s.weeklyCutoffTime);
}

/**
 * The first Monday whose cutoff is strictly after now. At the cutoff instant itself the lock runs, so a change
 * made at exactly 18:00:00 goes to the week after.
 */
export function nextLockableWeek(now: Date, s: ScheduleSettings): DateStr {
  let week = addDays(weekStartOf(addisDate(now)), 7);
  while (weeklyCutoff(week, s).getTime() <= now.getTime()) week = addDays(week, 7);
  return week;
}

/** Swaps, pauses, size and address changes made now take effect from this week. */
export function changeEffectiveWeek(now: Date, s: ScheduleSettings): DateStr {
  return nextLockableWeek(now, s);
}

/** The week the lock running at (or last run before) now locks: the week whose cutoff is the latest ≤ now. */
export function weekLockedAt(now: Date, s: ScheduleSettings): DateStr {
  return addDays(nextLockableWeek(now, s), -7);
}

export type MealDate = { serviceDate: DateStr; cookDate: DateStr; dropDate: DateStr; menu: MenuCode };

/**
 * The 7 menu days of a week with their cook and drop dates (cook = drop). A non-service Sunday is cooked and
 * dropped on Saturday when sundayWithSaturday is on (and Saturday is a service day); otherwise it is omitted.
 */
export function mealDatesForWeek(weekStart: DateStr, s: ScheduleSettings): MealDate[] {
  const monday = weekStartOf(weekStart);
  const out: MealDate[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const menu = menuForDate(d, s);
    if (isServiceDay(d, s)) {
      out.push({ serviceDate: d, cookDate: d, dropDate: d, menu });
    } else if (isoWeekday(d) === 7 && s.sundayWithSaturday && isServiceDay(addDays(d, -1), s)) {
      const sat = addDays(d, -1);
      out.push({ serviceDate: d, cookDate: sat, dropDate: sat, menu });
    }
  }
  return out;
}

/** Meal dates whose service date lies in [start, end]. */
export function mealDatesBetween(start: DateStr, end: DateStr, s: ScheduleSettings): MealDate[] {
  const out: MealDate[] = [];
  for (let w = weekStartOf(start); w <= end; w = addDays(w, 7)) {
    for (const md of mealDatesForWeek(w, s)) if (md.serviceDate >= start && md.serviceDate <= end) out.push(md);
  }
  return out;
}

export type QuickStartPlan = {
  /** first service date */
  startDate: DateStr;
  /** last date billed by the quick-start invoice (a Sunday) */
  periodEnd: DateStr;
  /** service days in [startDate, periodEnd] — what the client pays for */
  serviceDays: number;
  /** meal dates in the period (includes a Sunday folded into Saturday) */
  mealDates: MealDate[];
  /** pay by this instant (the daily quick-start lock) */
  lockAt: Date;
  /** true when the first possible start date was full */
  capacityShifted: boolean;
};

/**
 * Quick start (DECISIONS D017-D018, D104):
 * - lockAt = today's quick-start cutoff (18:00 Addis) if now is before it, else tomorrow's;
 * - start = first service day after the lock date that still has capacity (takenByDate counts reserved starts);
 * - periodEnd = the Sunday before the first week locked by a weekly cutoff strictly after the client's lock
 *   (a weekly lock at the very same instant does not include them). From that week on they are a weekly client.
 * Returns null when no date in the next 120 days has room (e.g. capacity 0).
 */
export function quickStartPlan(now: Date, s: ScheduleSettings, takenByDate: Record<DateStr, number> = {}): QuickStartPlan | null {
  const today = addisDate(now);
  const todayLock = addisInstant(today, s.quickStartCutoffTime);
  const lockAt = now.getTime() < todayLock.getTime() ? todayLock : addisInstant(addDays(today, 1), s.quickStartCutoffTime);
  const lockDate = addisDate(lockAt);

  let start = nextServiceDay(lockDate, s);
  if (!start) return null;
  const first = start;
  let guard = 0;
  while ((takenByDate[start] ?? 0) >= s.quickStartDailyCapacity) {
    start = nextServiceDay(start, s)!;
    if (++guard > 120) return null;
  }
  // when pushed by capacity the client is added by the daily lock the evening before the start
  const startLock = addisInstant(addDays(start, -1), s.quickStartCutoffTime);
  const refLock = startLock.getTime() > lockAt.getTime() ? startLock : lockAt;
  const firstWeeklyWeek = nextLockableWeek(refLock, s);
  const periodEnd = addDays(firstWeeklyWeek, -1);
  const days = serviceDaysBetween(start, periodEnd, s);
  return {
    startDate: start,
    periodEnd,
    serviceDays: days.length,
    mealDates: mealDatesBetween(start, periodEnd, s),
    lockAt,
    capacityShifted: start !== first,
  };
}

export type DropSlot = "breakfast" | "lunch" | "dinner_snack";
export type DropPlan = { dropDate: DateStr; serviceDates: DateStr[]; slot: DropSlot | null; kind: "delivery" | "pickup" };

/**
 * Drops for a set of meal dates:
 * daily / pickup: one per drop date; three_drops: breakfast, lunch and dinner_snack per drop date;
 * every_3_days: groups of up to 3 consecutive meal dates, dropped on the first one's drop date;
 * weekly: everything in one drop on the first drop date.
 */
export function dropsFor(option: DeliveryOption, mealDates: MealDate[]): DropPlan[] {
  const sorted = [...mealDates].sort((a, b) => (a.serviceDate < b.serviceDate ? -1 : 1));
  const kind = option === "pickup" ? "pickup" : "delivery";
  const byDropDate = () => {
    const map = new Map<DateStr, DateStr[]>();
    for (const md of sorted) map.set(md.dropDate, [...(map.get(md.dropDate) ?? []), md.serviceDate]);
    return [...map.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
  };
  switch (option) {
    case "daily":
    case "pickup":
      return byDropDate().map(([dropDate, serviceDates]) => ({ dropDate, serviceDates, slot: null, kind }));
    case "three_drops":
      return byDropDate().flatMap(([dropDate, serviceDates]) =>
        (["breakfast", "lunch", "dinner_snack"] as DropSlot[]).map((slot) => ({ dropDate, serviceDates, slot, kind })),
      );
    case "every_3_days": {
      const out: DropPlan[] = [];
      for (let i = 0; i < sorted.length; i += 3) {
        const group = sorted.slice(i, i + 3);
        out.push({ dropDate: group[0].dropDate, serviceDates: group.map((g) => g.serviceDate), slot: null, kind });
      }
      return out;
    }
    case "weekly":
      return sorted.length ? [{ dropDate: sorted[0].dropDate, serviceDates: sorted.map((m) => m.serviceDate), slot: null, kind }] : [];
  }
}

/** Meal dates with cook / drop dates moved to the drop that carries them (every-3-days and weekly cook early). */
export function alignToDrops(option: DeliveryOption, mealDates: MealDate[]): MealDate[] {
  const dropOf = new Map<DateStr, DateStr>();
  for (const d of dropsFor(option, mealDates)) for (const sd of d.serviceDates) dropOf.set(sd, d.dropDate);
  return mealDates.map((md) => {
    const drop = dropOf.get(md.serviceDate) ?? md.dropDate;
    return { ...md, cookDate: drop, dropDate: drop };
  });
}
