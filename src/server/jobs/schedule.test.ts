import { describe, expect, it } from "vitest";
import { JOB_SCHEDULES, lastScheduledAt } from "./schedule";

describe("job schedules", () => {
  it("finds the last scheduled instant for daily and weekly crons", () => {
    const now = new Date("2026-10-27T08:41:00Z"); // Tue 11:41 Addis
    expect(lastScheduledAt("0 3 * * *", now).toISOString()).toBe("2026-10-27T03:00:00.000Z");
    expect(lastScheduledAt("0 15 * * *", now).toISOString()).toBe("2026-10-26T15:00:00.000Z");
    expect(lastScheduledAt("0 7 * * 2", now).toISOString()).toBe("2026-10-27T07:00:00.000Z");
    expect(lastScheduledAt("0 7 * * 2", new Date("2026-10-27T06:59:00Z")).toISOString()).toBe("2026-10-20T07:00:00.000Z");
    expect(lastScheduledAt("0 15 * * 4", now).toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(lastScheduledAt("0 14 * * 0", now).toISOString()).toBe("2026-10-25T14:00:00.000Z");
  });

  it("matches the Addis times in CRON.md (UTC + 3)", () => {
    expect(JOB_SCHEDULES["thursday-lock"]).toEqual({ cron: "0 15 * * 4", addis: "Thu 18:00" });
    expect(JOB_SCHEDULES["daily-morning"]).toEqual({ cron: "0 3 * * *", addis: "Daily 06:00" });
  });
});
