import { describe, expect, it } from "vitest";
import { checkinDue, lastCheckinOlderThan, renewalRemindersDue } from "./checkins";

describe("check-ins and renewals", () => {
  it("renewal reminders 5 days and 1 day before the end date", () => {
    const subs = [
      { id: "a", endDate: "2026-10-26", status: "active" as const },
      { id: "b", endDate: "2026-10-22", status: "active" as const },
      { id: "c", endDate: "2026-10-25", status: "active" as const },
      { id: "d", endDate: "2026-10-26", status: "paused" as const },
    ];
    expect(renewalRemindersDue(subs, "2026-10-21")).toEqual([
      { subscriptionId: "a", daysLeft: 5 },
      { subscriptionId: "b", daysLeft: 1 },
    ]);
  });
  it("check-in due on the client's weekday", () => {
    expect(checkinDue({ checkInWeekday: 3, status: "active" }, "2026-10-21")).toBe(true);
    expect(checkinDue({ checkInWeekday: 4, status: "active" }, "2026-10-21")).toBe(false);
    expect(checkinDue({ checkInWeekday: 3, status: "paused" }, "2026-10-21")).toBe(false);
    expect(checkinDue({ checkInWeekday: null }, "2026-10-21")).toBe(false);
  });
  it("last check-in older than N days", () => {
    expect(lastCheckinOlderThan("2026-10-07", "2026-10-21", 14)).toBe(false);
    expect(lastCheckinOlderThan("2026-10-06", "2026-10-21", 14)).toBe(true);
    expect(lastCheckinOlderThan(null, "2026-10-21", 14)).toBe(true);
  });
});
