import { afterEach, describe, expect, it } from "vitest";
import {
  addDays, addMonths, addisDate, addisInstant, addisMinutes, addisTime, daysBetween, datesInRange, formatAddisDateTime, formatDate,
  isDateStr, isoWeekday, maxDate, minDate, monthEndOf, monthStartOf, startOfAddisDay, weekStartOf, compareDates, isWithin,
} from "./time";

const originalTz = process.env.TZ;
afterEach(() => {
  process.env.TZ = originalTz;
});

describe("Addis time", () => {
  it("2026-10-22T15:00:00Z is Thursday 18:00 in Addis", () => {
    const t = new Date("2026-10-22T15:00:00Z");
    expect(addisDate(t)).toBe("2026-10-22");
    expect(addisTime(t)).toBe("18:00");
    expect(isoWeekday(addisDate(t))).toBe(4);
    expect(addisMinutes(t)).toBe(18 * 60);
  });

  it("an instant late in the UTC evening is already the next Addis day", () => {
    const t = new Date("2026-10-22T21:30:00Z"); // 00:30 on the 23rd in Addis
    expect(addisDate(t)).toBe("2026-10-23");
    expect(addisTime(t)).toBe("00:30");
  });

  it("addisInstant converts Addis wall time to UTC (+3, no DST)", () => {
    expect(addisInstant("2026-10-22", "18:00").toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(addisInstant("2026-01-01", "00:00").toISOString()).toBe("2025-12-31T21:00:00.000Z");
    expect(addisInstant("2026-07-01", "06:30").toISOString()).toBe("2026-07-01T03:30:00.000Z");
    expect(startOfAddisDay("2026-10-19").toISOString()).toBe("2026-10-18T21:00:00.000Z");
  });

  it("rejects malformed dates and times", () => {
    expect(() => addisInstant("2026-02-30", "10:00")).toThrow();
    expect(() => addisInstant("2026-10-22", "25:00")).toThrow();
    expect(isDateStr("2026-02-29")).toBe(false);
    expect(isDateStr("2028-02-29")).toBe(true);
    expect(isDateStr("2026-1-01")).toBe(false);
  });

  it("is correct whatever the process time zone is", () => {
    for (const tz of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Europe/London", "Asia/Kolkata"]) {
      process.env.TZ = tz;
      const t = new Date("2026-10-22T15:00:00Z");
      expect(addisDate(t)).toBe("2026-10-22");
      expect(addisTime(t)).toBe("18:00");
      expect(addisInstant("2026-10-22", "18:00").toISOString()).toBe("2026-10-22T15:00:00.000Z");
      expect(addDays("2026-03-28", 2)).toBe("2026-03-30"); // across European / US DST changes
      expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
      expect(isoWeekday("2026-10-19")).toBe(1);
      expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
      expect(formatDate("2026-10-22")).toBe("Thu 22 Oct");
    }
  });
});

describe("date arithmetic", () => {
  it("weekdays and week starts (ISO, Monday = 1)", () => {
    expect(isoWeekday("2026-10-19")).toBe(1);
    expect(isoWeekday("2026-10-25")).toBe(7);
    expect(isoWeekday("1970-01-01")).toBe(4);
    expect(weekStartOf("2026-10-19")).toBe("2026-10-19");
    expect(weekStartOf("2026-10-25")).toBe("2026-10-19");
    expect(weekStartOf("2026-11-01")).toBe("2026-10-26");
  });

  it("adds days and months, counts days", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-19", "2026-10-26")).toBe(7);
    expect(daysBetween("2026-10-26", "2026-10-19")).toBe(-7);
    expect(addMonths("2026-10-22", 4)).toBe("2027-02-22");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-15", -12)).toBe("2025-11-15");
  });

  it("ranges, min / max, months", () => {
    expect(datesInRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(datesInRange("2026-11-02", "2026-11-01")).toEqual([]);
    expect(minDate("2026-10-22", "2026-10-19", "2026-11-01")).toBe("2026-10-19");
    expect(maxDate("2026-10-22", "2026-10-19", "2026-11-01")).toBe("2026-11-01");
    expect(monthStartOf("2026-02-17")).toBe("2026-02-01");
    expect(monthEndOf("2026-02-17")).toBe("2026-02-28");
    expect(monthEndOf("2026-12-03")).toBe("2026-12-31");
    expect(compareDates("2026-10-19", "2026-10-20")).toBe(-1);
    expect(compareDates("2026-10-20", "2026-10-20")).toBe(0);
    expect(isWithin("2026-10-20", "2026-10-19", "2026-10-20")).toBe(true);
    expect(isWithin("2026-10-21", "2026-10-19", "2026-10-20")).toBe(false);
  });

  it("formats Gregorian dates in English", () => {
    expect(formatDate("2026-10-22", "short")).toBe("Thu 22 Oct");
    expect(formatDate("2026-10-22", "long")).toBe("Thursday, 22 October 2026");
    expect(formatAddisDateTime(new Date("2026-10-22T15:00:00Z"))).toBe("Thu 22 Oct, 18:00");
  });
});
