// Check-ins and renewal reminders (module 12, the daily 09:00 job).
import { addDays, daysBetween, isoWeekday } from "./time";
import type { ClientStatus, DateStr, SubscriptionStatus } from "./types";

/** Active subscriptions ending in exactly 5 or 1 days. */
export function renewalRemindersDue(
  subs: { id: string; endDate: DateStr; status: SubscriptionStatus }[],
  today: DateStr,
  daysBefore: number[] = [5, 1],
): { subscriptionId: string; daysLeft: number }[] {
  return subs
    .filter((s) => s.status === "active")
    .map((s) => ({ subscriptionId: s.id, daysLeft: daysBetween(today, s.endDate) }))
    .filter((r) => daysBefore.includes(r.daysLeft));
}

/** Today is the client's check-in weekday (1 = Monday … 7 = Sunday) and the client is active. */
export function checkinDue(client: { checkInWeekday: number | null; status?: ClientStatus }, today: DateStr): boolean {
  if (client.checkInWeekday == null) return false;
  if (client.status && client.status !== "active") return false;
  return isoWeekday(today) === client.checkInWeekday;
}

/** True when the last check-in is more than `days` days ago, or there is none. */
export function lastCheckinOlderThan(last: DateStr | null, today: DateStr, days: number): boolean {
  if (!last) return true;
  return addDays(last, days) < today;
}
