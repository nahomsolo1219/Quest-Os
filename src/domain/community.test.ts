import { describe, expect, it } from "vitest";
import { canPost, canReact, canRead, communityAccess, communityPowers, formatProgress, leaderboard, progressSummary, streak } from "./community";
import { addisInstant as at } from "./time";

const now = at("2026-10-21", "10:00");
const member = (over: Partial<Parameters<typeof communityAccess>[0]> = {}) => ({
  roles: ["client" as const], clientStatus: "active" as const, endedAt: null, mutedUntil: null, ...over,
});

describe("community access", () => {
  it("active -> full, paused -> react, lead -> none", () => {
    expect(communityAccess(member(), now)).toBe("full");
    expect(communityAccess(member({ clientStatus: "paused" }), now)).toBe("react");
    expect(communityAccess(member({ clientStatus: "lead" }), now)).toBe("none");
  });
  it("ended -> react until ended_at + 14 days, then none", () => {
    expect(communityAccess(member({ clientStatus: "ended", endedAt: "2026-10-07" }), now)).toBe("react"); // day 14
    expect(communityAccess(member({ clientStatus: "ended", endedAt: "2026-10-06" }), now)).toBe("none");
    expect(communityAccess(member({ clientStatus: "ended", endedAt: "2026-10-06" }), now, { endedAccessDays: 30 })).toBe("react");
  });
  it("muted members can read and react until the mute ends", () => {
    expect(communityAccess(member({ mutedUntil: at("2026-10-22", "10:00") }), now)).toBe("react");
    expect(communityAccess(member({ mutedUntil: at("2026-10-21", "09:59") }), now)).toBe("full");
  });
  it("staff: owner / operations / coach full, nutritionist read, kitchen none", () => {
    expect(communityAccess({ roles: ["owner", "coach"], clientStatus: null, endedAt: null, mutedUntil: null }, now)).toBe("full");
    expect(communityAccess({ roles: ["operations"], clientStatus: null, endedAt: null, mutedUntil: null }, now)).toBe("full");
    expect(communityAccess({ roles: ["nutritionist"], clientStatus: null, endedAt: null, mutedUntil: null }, now)).toBe("read");
    expect(communityAccess({ roles: ["kitchen"], clientStatus: null, endedAt: null, mutedUntil: null }, now)).toBe("none");
  });
  it("capabilities per level and role", () => {
    expect([canRead("read"), canReact("read"), canPost("read")]).toEqual([true, false, false]);
    expect([canRead("react"), canReact("react"), canPost("react")]).toEqual([true, true, false]);
    expect(canPost("full")).toBe(true);
    expect(canRead("none")).toBe(false);
    expect(communityPowers(["coach"])).toEqual({ moderate: false, pin: true, challenges: true, markAnswer: true, coachBadge: true });
    expect(communityPowers(["operations"]).moderate).toBe(true);
  });
});

describe("progress, streaks, leaderboard", () => {
  it("summarises weight change from check-ins", () => {
    const p = progressSummary([
      { checkinDate: "2026-09-23", weightG: 85400 },
      { checkinDate: "2026-10-07", weightG: null },
      { checkinDate: "2026-10-21", weightG: 82200 },
      { checkinDate: "2026-09-30", weightG: 84800 },
    ]);
    expect(p).toEqual({ kgChange: -3.2, weeks: 4 });
    expect(formatProgress(p!)).toBe("−3.2 kg in 4 weeks");
    expect(formatProgress({ kgChange: 1.5, weeks: 1 })).toBe("+1.5 kg in 1 week");
    expect(progressSummary([{ checkinDate: "2026-10-21", weightG: 80000 }])).toBeNull();
  });

  it("streak counts consecutive days ending today or yesterday", () => {
    const dates = ["2026-10-18", "2026-10-19", "2026-10-20", "2026-10-16"];
    expect(streak(dates, "2026-10-20")).toBe(3);
    expect(streak(dates, "2026-10-21")).toBe(3);
    expect(streak(dates, "2026-10-22")).toBe(0);
    expect(streak([], "2026-10-22")).toBe(0);
  });

  it("leaderboard by days completed", () => {
    const l = leaderboard([
      { userId: "u2", checkinDate: "2026-10-19" },
      { userId: "u1", checkinDate: "2026-10-19" },
      { userId: "u1", checkinDate: "2026-10-20" },
      { userId: "u1", checkinDate: "2026-10-20" },
      { userId: "u3", checkinDate: "2026-10-20" },
    ]);
    expect(l).toEqual([{ userId: "u1", days: 2 }, { userId: "u2", days: 1 }, { userId: "u3", days: 1 }]);
  });
});
