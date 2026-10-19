// Community (SPEC document 7): access levels, progress summaries, streaks, leaderboard.
import { signed } from "./format";
import type { CommunitySettings } from "./settings";
import { addDays, addisDate, daysBetween } from "./time";
import type { ClientStatus, DateStr, Role } from "./types";



export type CommunityAccess = "none" | "read" | "react" | "full";
const LEVELS: CommunityAccess[] = ["none", "read", "react", "full"];
const maxLevel = (a: CommunityAccess, b: CommunityAccess) => (LEVELS.indexOf(a) >= LEVELS.indexOf(b) ? a : b);
const minLevel = (a: CommunityAccess, b: CommunityAccess) => (LEVELS.indexOf(a) <= LEVELS.indexOf(b) ? a : b);

/**
 * active -> full; paused -> react (read + react); ended -> react until endedAt + endedAccessDays, then none;
 * a muted member is capped at react until the mute ends; owner / operations / coach -> full; nutritionist -> read.
 */
export function communityAccess(
  m: { roles: Role[]; clientStatus: ClientStatus | null; endedAt: DateStr | null; mutedUntil: Date | null },
  now: Date,
  s: Pick<CommunitySettings, "endedAccessDays"> = { endedAccessDays: 14 },
): CommunityAccess {
  let client: CommunityAccess = "none";
  if (m.roles.includes("client") || m.clientStatus) {
    switch (m.clientStatus) {
      case "active":
        client = "full";
        break;
      case "paused":
        client = "react";
        break;
      case "ended":
        client = m.endedAt && addisDate(now) <= addDays(m.endedAt, s.endedAccessDays) ? "react" : "none";
        break;
      default:
        client = "none";
    }
    if (m.mutedUntil && m.mutedUntil.getTime() > now.getTime()) client = minLevel(client, "react");
  }
  let staff: CommunityAccess = "none";
  if (m.roles.some((r) => r === "owner" || r === "operations" || r === "coach")) staff = "full";
  else if (m.roles.includes("nutritionist")) staff = "read";
  return maxLevel(client, staff);
}

export function canPost(a: CommunityAccess): boolean {
  return a === "full";
}
export function canReact(a: CommunityAccess): boolean {
  return a === "full" || a === "react";
}
export function canRead(a: CommunityAccess): boolean {
  return a !== "none";
}

/** What staff roles may do beyond posting. */
export function communityPowers(roles: Role[]): { moderate: boolean; pin: boolean; challenges: boolean; markAnswer: boolean; coachBadge: boolean } {
  const coach = roles.includes("coach");
  const mod = roles.includes("owner") || roles.includes("operations");
  return { moderate: mod, pin: coach, challenges: coach, markAnswer: coach, coachBadge: coach };
}

/** Weight change between the first and last weigh-in: { kgChange: −3.2, weeks: 4 }; null with fewer than 2. */
export function progressSummary(checkins: { checkinDate: DateStr; weightG: number | null }[]): { kgChange: number; weeks: number } | null {
  const w = checkins.filter((c) => c.weightG != null).sort((a, b) => (a.checkinDate < b.checkinDate ? -1 : 1));
  if (w.length < 2) return null;
  const first = w[0];
  const last = w[w.length - 1];
  const days = daysBetween(first.checkinDate, last.checkinDate);
  if (days <= 0) return null;
  return { kgChange: Math.round((last.weightG! - first.weightG!) / 100) / 10, weeks: Math.max(1, Math.round(days / 7)) };
}

/** "−3.2 kg in 4 weeks" (real minus sign). */
export function formatProgress(p: { kgChange: number; weeks: number }): string {
  return `${signed(p.kgChange, 1)} kg in ${p.weeks} ${p.weeks === 1 ? "week" : "weeks"}`;
}

/** Consecutive days with a check-in ending today, or yesterday when today has none yet. */
export function streak(checkinDates: DateStr[], today: DateStr): number {
  const set = new Set(checkinDates);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

/** Days completed per member (distinct dates), most first; ties by user id for a stable order. */
export function leaderboard(checkins: { userId: string; checkinDate: DateStr }[]): { userId: string; days: number }[] {
  const m = new Map<string, Set<DateStr>>();
  for (const c of checkins) {
    if (!m.has(c.userId)) m.set(c.userId, new Set());
    m.get(c.userId)!.add(c.checkinDate);
  }
  return [...m.entries()].map(([userId, s]) => ({ userId, days: s.size })).sort((a, b) => b.days - a.days || a.userId.localeCompare(b.userId));
}
