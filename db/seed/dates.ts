// Small calendar helpers for the seed (plain YYYY-MM-DD strings, UTC arithmetic: no time zones involved).
// The app itself uses src/domain/time.ts; the seed keeps its own copy so it does not depend on work in progress there.

const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
const toStr = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, n: number): string {
  const d = toDate(date);
  d.setUTCDate(d.getUTCDate() + n);
  return toStr(d);
}

/** ISO weekday, Monday = 1 … Sunday = 7 */
export function isoWeekday(date: string): number {
  const w = toDate(date).getUTCDay();
  return w === 0 ? 7 : w;
}

export function weekStartOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** same day n months later, clamped to the month's last day */
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return toStr(target);
}

/** today's date in Africa/Addis_Ababa */
export function addisToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa" }).format(now);
}

/** Addis wall-clock time on a date as a UTC instant. Addis is UTC+3 all year (no DST). */
export function addisInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+03:00`);
}

export function datesInRange(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}
