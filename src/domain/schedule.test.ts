import { describe, expect, it } from "vitest";
import {
  alignToDrops, changeEffectiveWeek, dropsFor, isServiceDay, mealDatesBetween, mealDatesForWeek, menuForDate, nextLockableWeek, nextServiceDay,
  quickStartPlan, serviceDaysBetween, weekLockedAt, weeklyCutoff,
} from "./schedule";
import { DEFAULT_SCHEDULE as S } from "./settings";
import { addisInstant as at } from "./time";

// Week of Monday 2026-10-19: Thu 22nd, Fri 23rd, Sat 24th, Sun 25th; next Monday 26th.

describe("rotation and service days", () => {
  it("Mon A, Tue B, Wed C, Thu D, Fri A, Sat B, Sun C", () => {
    const menus = ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"].map((d) => menuForDate(d, S));
    expect(menus).toEqual(["A", "B", "C", "D", "A", "B", "C"]);
  });
  it("service days Monday to Saturday", () => {
    expect(isServiceDay("2026-10-24", S)).toBe(true);
    expect(isServiceDay("2026-10-25", S)).toBe(false);
    expect(nextServiceDay("2026-10-24", S)).toBe("2026-10-26");
    expect(nextServiceDay("2026-10-19", S)).toBe("2026-10-20");
    expect(serviceDaysBetween("2026-10-21", "2026-10-27", S)).toHaveLength(6);
    expect(nextServiceDay("2026-10-19", { ...S, serviceDays: [] as unknown as number[] })).toBeNull();
  });
});

describe("weekly cutoff (Thursday 18:00 Addis of the week before)", () => {
  it("the week of 26 Oct locks at Thu 22 Oct 18:00 Addis = 15:00 UTC", () => {
    expect(weeklyCutoff("2026-10-26", S).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(weeklyCutoff("2026-10-28", S).toISOString()).toBe("2026-10-22T15:00:00.000Z"); // any day of the week
  });

  it("17:59 -> next week; 18:00 and 18:01 -> the week after", () => {
    expect(nextLockableWeek(at("2026-10-22", "17:59"), S)).toBe("2026-10-26");
    expect(nextLockableWeek(new Date("2026-10-22T14:59:59.999Z"), S)).toBe("2026-10-26");
    expect(nextLockableWeek(at("2026-10-22", "18:00"), S)).toBe("2026-11-02");
    expect(nextLockableWeek(at("2026-10-22", "18:01"), S)).toBe("2026-11-02");
    expect(changeEffectiveWeek(at("2026-10-22", "18:00"), S)).toBe("2026-11-02");
  });

  it("early in the week changes still reach next week", () => {
    expect(nextLockableWeek(at("2026-10-19", "00:01"), S)).toBe("2026-10-26");
    expect(nextLockableWeek(at("2026-10-25", "23:59"), S)).toBe("2026-11-02");
    expect(nextLockableWeek(at("2026-10-26", "00:00"), S)).toBe("2026-11-02");
  });

  it("knows which week a lock covers", () => {
    expect(weekLockedAt(at("2026-10-22", "18:00"), S)).toBe("2026-10-26");
    expect(weekLockedAt(at("2026-10-22", "17:59"), S)).toBe("2026-10-19");
  });

  it("follows the cutoff settings", () => {
    const wed = { ...S, weeklyCutoffWeekday: 3, weeklyCutoffTime: "12:00" };
    expect(weeklyCutoff("2026-10-26", wed).toISOString()).toBe("2026-10-21T09:00:00.000Z");
    expect(nextLockableWeek(at("2026-10-21", "13:00"), wed)).toBe("2026-11-02");
  });
});

describe("meal dates", () => {
  it("Sunday's meals are cooked and dropped Saturday", () => {
    const d = mealDatesForWeek("2026-10-26", S);
    expect(d).toHaveLength(7);
    expect(d[6]).toEqual({ serviceDate: "2026-11-01", cookDate: "2026-10-31", dropDate: "2026-10-31", menu: "C" });
    expect(d[0]).toEqual({ serviceDate: "2026-10-26", cookDate: "2026-10-26", dropDate: "2026-10-26", menu: "A" });
  });
  it("without sundayWithSaturday Sunday is omitted; with Sunday as a service day it is cooked Sunday", () => {
    expect(mealDatesForWeek("2026-10-26", { ...S, sundayWithSaturday: false })).toHaveLength(6);
    const seven = mealDatesForWeek("2026-10-26", { ...S, serviceDays: [1, 2, 3, 4, 5, 6, 7] });
    expect(seven[6].cookDate).toBe("2026-11-01");
  });
  it("meal dates between two dates span weeks", () => {
    const d = mealDatesBetween("2026-10-24", "2026-11-01", S);
    expect(d.map((x) => x.serviceDate)).toEqual(["2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]);
  });
});

describe("quick start", () => {
  it("Monday 17:59 -> lock today 18:00, start Tuesday, pay for Tue–Sat", () => {
    const p = quickStartPlan(at("2026-10-19", "17:59"), S)!;
    expect(p.lockAt.toISOString()).toBe("2026-10-19T15:00:00.000Z");
    expect(p.startDate).toBe("2026-10-20");
    expect(p.periodEnd).toBe("2026-10-25");
    expect(p.serviceDays).toBe(5);
    expect(p.mealDates.map((m) => m.serviceDate)).toEqual(["2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(p.capacityShifted).toBe(false);
  });

  it("Monday 18:01 -> lock tomorrow 18:00, start Wednesday", () => {
    const p = quickStartPlan(at("2026-10-19", "18:01"), S)!;
    expect(p.lockAt.toISOString()).toBe("2026-10-20T15:00:00.000Z");
    expect(p.startDate).toBe("2026-10-21");
    expect(p.periodEnd).toBe("2026-10-25");
    expect(p.serviceDays).toBe(4);
  });

  it("exactly 18:00 counts as after the lock", () => {
    expect(quickStartPlan(at("2026-10-19", "18:00"), S)!.startDate).toBe("2026-10-21");
  });

  it("on a Saturday the next service day is Monday", () => {
    const p = quickStartPlan(at("2026-10-24", "10:00"), S)!;
    expect(p.lockAt.toISOString()).toBe("2026-10-24T15:00:00.000Z");
    expect(p.startDate).toBe("2026-10-26");
    // the week of 26 Oct was locked on Thu 22 Oct without this client, so quick start covers it
    expect(p.periodEnd).toBe("2026-11-01");
    expect(p.serviceDays).toBe(6);
    // Saturday after 18:00 and Sunday also start Monday
    expect(quickStartPlan(at("2026-10-24", "19:00"), S)!.startDate).toBe("2026-10-26");
    expect(quickStartPlan(at("2026-10-25", "12:00"), S)!.startDate).toBe("2026-10-26");
  });

  it("when capacity is full the next date with room is offered", () => {
    const p = quickStartPlan(at("2026-10-19", "10:00"), S, { "2026-10-20": 5 })!;
    expect(p.startDate).toBe("2026-10-21");
    expect(p.capacityShifted).toBe(true);
    expect(p.serviceDays).toBe(4);
    const q = quickStartPlan(at("2026-10-19", "10:00"), S, { "2026-10-20": 5, "2026-10-21": 7, "2026-10-22": 4 })!;
    expect(q.startDate).toBe("2026-10-22");
    expect(quickStartPlan(at("2026-10-19", "10:00"), { ...S, quickStartDailyCapacity: 0 })).toBeNull();
  });

  it("capacity pushing the start past a weekly cutoff moves the period end too", () => {
    // Wed 10:00: first choice Thu 22; Thu, Fri, Sat full -> Mon 26 (week already locked on Thu 22)
    const p = quickStartPlan(at("2026-10-21", "10:00"), S, { "2026-10-22": 5, "2026-10-23": 5, "2026-10-24": 5 })!;
    expect(p.startDate).toBe("2026-10-26");
    expect(p.periodEnd).toBe("2026-11-01");
    expect(p.serviceDays).toBe(6);
  });

  it("a Friday sign-up starts Saturday and is billed through the end of next week", () => {
    const p = quickStartPlan(at("2026-10-23", "09:00"), S)!;
    expect(p.startDate).toBe("2026-10-24");
    expect(p.periodEnd).toBe("2026-11-01");
    expect(p.serviceDays).toBe(7); // Sat + Mon–Sat
    expect(p.mealDates).toHaveLength(9); // Sat, Sun (with Sat), Mon–Sun
  });

  it("a quick-start lock at the same instant as the Thursday cutoff is not in that weekly lock", () => {
    const p = quickStartPlan(at("2026-10-22", "10:00"), S)!;
    expect(p.lockAt.toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(p.startDate).toBe("2026-10-23");
    expect(p.periodEnd).toBe("2026-11-01");
    expect(p.serviceDays).toBe(8);
    // Wednesday: the Thursday lock comes after the client's lock, so the period ends this Sunday
    const w = quickStartPlan(at("2026-10-21", "10:00"), S)!;
    expect(w.startDate).toBe("2026-10-22");
    expect(w.periodEnd).toBe("2026-10-25");
    expect(w.serviceDays).toBe(3);
  });
});

describe("drops", () => {
  const dates = mealDatesForWeek("2026-10-26", S);
  it("daily: one drop per drop date, Sunday in Saturday's drop", () => {
    const d = dropsFor("daily", dates);
    expect(d).toHaveLength(6);
    expect(d[5]).toEqual({ dropDate: "2026-10-31", serviceDates: ["2026-10-31", "2026-11-01"], slot: null, kind: "delivery" });
  });
  it("pickup has the same dates with kind pickup", () => {
    const d = dropsFor("pickup", dates);
    expect(d).toHaveLength(6);
    expect(d.every((x) => x.kind === "pickup")).toBe(true);
  });
  it("three drops: breakfast, lunch, dinner_snack per drop date", () => {
    const d = dropsFor("three_drops", dates);
    expect(d).toHaveLength(18);
    expect(d.slice(0, 3).map((x) => x.slot)).toEqual(["breakfast", "lunch", "dinner_snack"]);
  });
  it("every 3 days: groups of up to 3 consecutive meal dates", () => {
    const d = dropsFor("every_3_days", dates);
    expect(d.map((x) => [x.dropDate, x.serviceDates.length])).toEqual([["2026-10-26", 3], ["2026-10-29", 3], ["2026-10-31", 1]]);
    const aligned = alignToDrops("every_3_days", dates);
    expect(aligned[2]).toMatchObject({ serviceDate: "2026-10-28", cookDate: "2026-10-26", dropDate: "2026-10-26" });
  });
  it("weekly: one drop", () => {
    expect(dropsFor("weekly", dates)).toHaveLength(1);
    expect(dropsFor("weekly", [])).toEqual([]);
  });
});
