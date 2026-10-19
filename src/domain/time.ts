// The ONLY place time zones are handled. Every business date, cutoff and "today" is Africa/Addis_Ababa.
// DateStr ('YYYY-MM-DD') arithmetic is done on UTC epoch days, so it never depends on the process TZ.
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DateStr } from "./types";

export type { DateStr } from "./types";
export const ADDIS_TZ = "Africa/Addis_Ababa";

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function isDateStr(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function parts(date: DateStr): [number, number, number] {
  const m = DATE_RE.exec(date);
  if (!m || !isDateStr(date)) throw new Error(`Invalid date "${date}" (expected YYYY-MM-DD)`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function toEpochDay(date: DateStr): number {
  const [y, m, d] = parts(date);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

function fromEpochDay(day: number): DateStr {
  const dt = new Date(day * DAY_MS);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Business date in Addis for an instant. */
export function addisDate(instant: Date): DateStr {
  return formatInTimeZone(instant, ADDIS_TZ, "yyyy-MM-dd");
}

/** Wall-clock time 'HH:mm' in Addis for an instant. */
export function addisTime(instant: Date): string {
  return formatInTimeZone(instant, ADDIS_TZ, "HH:mm");
}

/** Addis wall time on a business date -> UTC instant. */
export function addisInstant(date: DateStr, time: string): Date {
  parts(date);
  if (!TIME_RE.test(time)) throw new Error(`Invalid time "${time}" (expected HH:mm)`);
  return fromZonedTime(`${date}T${time}:00`, ADDIS_TZ);
}

/** Addis midnight at the start of a business date. */
export function startOfAddisDay(date: DateStr): Date {
  return addisInstant(date, "00:00");
}

/** ISO weekday, Monday = 1 … Sunday = 7. */
export function isoWeekday(date: DateStr): IsoWeekday {
  // epoch day 0 (1970-01-01) was a Thursday (4)
  const d = ((toEpochDay(date) + 3) % 7 + 7) % 7; // 0 = Monday
  return (d + 1) as IsoWeekday;
}

export function addDays(date: DateStr, n: number): DateStr {
  return fromEpochDay(toEpochDay(date) + n);
}

/** b − a in whole days. */
export function daysBetween(a: DateStr, b: DateStr): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Monday of the ISO week containing date. */
export function weekStartOf(date: DateStr): DateStr {
  return addDays(date, 1 - isoWeekday(date));
}

/** Adds calendar months, clamping to the last day of the month (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: DateStr, n: number): DateStr {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

export function compareDates(a: DateStr, b: DateStr): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDate(...dates: DateStr[]): DateStr {
  return dates.reduce((m, d) => (d < m ? d : m));
}

export function maxDate(...dates: DateStr[]): DateStr {
  return dates.reduce((m, d) => (d > m ? d : m));
}

/** Inclusive list of dates from a to b (empty when b < a). */
export function datesInRange(a: DateStr, b: DateStr): DateStr[] {
  const out: DateStr[] = [];
  for (let d = a; d <= b; d = addDays(d, 1)) out.push(d);
  return out;
}

export function isWithin(date: DateStr, start: DateStr, end: DateStr): boolean {
  return date >= start && date <= end;
}

/** First day of the month containing date. */
export function monthStartOf(date: DateStr): DateStr {
  return `${date.slice(0, 8)}01`;
}

/** Last day of the month containing date. */
export function monthEndOf(date: DateStr): DateStr {
  return addDays(addMonths(monthStartOf(date), 1), -1);
}

/** Addis wall time as minutes since midnight. */
export function addisMinutes(instant: Date): number {
  const [h, m] = addisTime(instant).split(":").map(Number);
  return h * 60 + m;
}

/** "Thu 22 Oct" (short, default) or "Thursday, 22 October 2026" (long). Gregorian, English. */
export function formatDate(date: DateStr, style: "short" | "long" = "short"): string {
  const noonUtc = new Date(toEpochDay(date) * DAY_MS + 12 * 3_600_000);
  return formatInTimeZone(noonUtc, "UTC", style === "long" ? "EEEE, d MMMM yyyy" : "EEE d MMM");
}

/** "Thu 22 Oct, 18:00" in Addis time. */
export function formatAddisDateTime(instant: Date): string {
  return formatInTimeZone(instant, ADDIS_TZ, "EEE d MMM, HH:mm");
}
