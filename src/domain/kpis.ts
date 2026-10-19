// Owners' dashboard KPIs (module 13), meal rating averages and clients needing attention.
import type { PricingSettings, ScheduleSettings } from "./settings";
import { addDays, addisDate, addisTime, monthEndOf, monthStartOf, weekStartOf } from "./time";
import type { ClientStatus, DateStr, DropStatus, InvoiceStatus, PaymentStatus, SubscriptionStatus } from "./types";

export type KpiInput = {
  /** any date in the month being reported (Addis) */
  month: DateStr;
  today: DateStr;
  clients: { id: string; status: ClientStatus; endedAt: DateStr | null }[];
  subscriptions: {
    clientId: string;
    status: SubscriptionStatus;
    startDate: DateStr;
    planPriceBirr: number;
    discountMonthBirr: number;
    isQuickStart: boolean;
  }[];
  invoices: { amountBirr: number; status: InvoiceStatus; issuedOn: DateStr }[];
  payments: { amountBirr: number; status: PaymentStatus; confirmedOn: DateStr | null }[];
  purchases: { totalPriceBirr: number; purchasedOn: DateStr }[];
  drops: { dropDate: DateStr; status: DropStatus; kind: "delivery" | "pickup"; deliveredAt: Date | null }[];
  pricing: Pick<PricingSettings, "fixedCostsPerMonthBirr" | "consultPerMonthBirr" | "dropCostBirr">;
  schedule: Pick<ScheduleSettings, "deliveryDeadlineTime">;
};

export type DashboardKpis = {
  activeClients: number;
  newThisMonth: number;
  churnedThisMonth: number;
  /** churned ÷ clients active at the start of the month (0 when there were none) */
  churnRate: number;
  /** Σ plan price − discount over active subscriptions */
  mrr: number;
  invoiced: number;
  collected: number;
  foodCost: number;
  /** food cost ÷ collected, null when nothing was collected */
  foodCostPct: number | null;
  /** collected − food cost − fixed costs − consult × active clients − delivery drops × drop cost */
  marginEstimate: number;
  deliveryCost: number;
  /** delivered on the drop date by the deadline ÷ delivery drops due so far this month; null when none */
  onTimePct: number | null;
  quickStartsThisWeek: number;
};

export function dashboardKpis(i: KpiInput): DashboardKpis {
  const ms = monthStartOf(i.month);
  const me = monthEndOf(i.month);
  const inMonth = (d: DateStr | null) => d != null && d >= ms && d <= me;

  const activeClients = i.clients.filter((c) => c.status === "active").length;
  const firstStart = new Map<string, DateStr>();
  for (const s of i.subscriptions) {
    if (s.status === "cancelled") continue;
    const prev = firstStart.get(s.clientId);
    if (!prev || s.startDate < prev) firstStart.set(s.clientId, s.startDate);
  }
  const newThisMonth = [...firstStart.values()].filter(inMonth).length;
  const churnedThisMonth = i.clients.filter((c) => c.status === "ended" && inMonth(c.endedAt)).length;
  const activeAtStart = activeClients + churnedThisMonth - newThisMonth;
  const churnRate = activeAtStart > 0 ? churnedThisMonth / activeAtStart : 0;

  const mrr = i.subscriptions
    .filter((s) => s.status === "active" && !s.isQuickStart)
    .reduce((sum, s) => sum + s.planPriceBirr - s.discountMonthBirr, 0);
  const invoiced = i.invoices.filter((x) => x.status !== "void" && inMonth(x.issuedOn)).reduce((s, x) => s + x.amountBirr, 0);
  const collected = i.payments.filter((p) => p.status === "confirmed" && inMonth(p.confirmedOn)).reduce((s, p) => s + p.amountBirr, 0);
  const foodCost = i.purchases.filter((p) => inMonth(p.purchasedOn)).reduce((s, p) => s + p.totalPriceBirr, 0);

  const deliveryDrops = i.drops.filter((d) => d.kind === "delivery" && inMonth(d.dropDate));
  const deliveryCost = deliveryDrops.length * i.pricing.dropCostBirr;
  const due = deliveryDrops.filter((d) => d.dropDate <= i.today);
  const onTime = due.filter(
    (d) => d.status === "delivered" && d.deliveredAt != null && addisDate(d.deliveredAt) === d.dropDate && addisTime(d.deliveredAt) <= i.schedule.deliveryDeadlineTime,
  ).length;

  const weekStart = weekStartOf(i.today);
  const weekEnd = addDays(weekStart, 6);
  return {
    activeClients,
    newThisMonth,
    churnedThisMonth,
    churnRate,
    mrr,
    invoiced,
    collected,
    foodCost,
    foodCostPct: collected > 0 ? foodCost / collected : null,
    marginEstimate: collected - foodCost - i.pricing.fixedCostsPerMonthBirr - i.pricing.consultPerMonthBirr * activeClients - deliveryCost,
    deliveryCost,
    onTimePct: due.length ? onTime / due.length : null,
    quickStartsThisWeek: i.subscriptions.filter((s) => s.isQuickStart && s.status !== "cancelled" && s.startDate >= weekStart && s.startDate <= weekEnd).length,
  };
}

/** Average rating per meal over the last 4 weeks (service dates in [today − 27, today]), best first. */
export function mealRatingAverages(
  ratings: { mealId: string; serviceDate: DateStr; rating: number }[],
  today: DateStr,
  days = 28,
): { mealId: string; avg: number; count: number }[] {
  const since = addDays(today, -(days - 1));
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of ratings) {
    if (r.serviceDate < since || r.serviceDate > today) continue;
    const a = acc.get(r.mealId) ?? { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    acc.set(r.mealId, a);
  }
  return [...acc.entries()]
    .map(([mealId, a]) => ({ mealId, avg: Math.round((a.sum / a.count) * 100) / 100, count: a.count }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count || a.mealId.localeCompare(b.mealId));
}

export type AttentionReason = "unpaid" | "allergy_conflict" | "no_checkin_2w";

/**
 * Active clients that need a look: an issued invoice past due, a conflict in the current order,
 * or no check-in for 14 days (counted from their start when they never checked in).
 */
export function clientsNeedingAttention(i: {
  now: Date;
  today: DateStr;
  clients: { clientId: string; activeSince: DateStr }[];
  invoices: { clientId: string; status: InvoiceStatus; dueAt: Date }[];
  currentOrderConflicts: { clientId: string; conflicts: string[] }[];
  lastCheckins: Record<string, DateStr | null | undefined>;
  checkinDays?: number;
}): { clientId: string; reasons: AttentionReason[] }[] {
  const limit = i.checkinDays ?? 14;
  const out: { clientId: string; reasons: AttentionReason[] }[] = [];
  for (const c of i.clients) {
    const reasons: AttentionReason[] = [];
    if (i.invoices.some((inv) => inv.clientId === c.clientId && inv.status === "issued" && inv.dueAt.getTime() < i.now.getTime())) reasons.push("unpaid");
    if (i.currentOrderConflicts.some((o) => o.clientId === c.clientId && o.conflicts.length > 0)) reasons.push("allergy_conflict");
    const last = i.lastCheckins[c.clientId] ?? null;
    const reference = last ?? c.activeSince;
    if (addDays(reference, limit) <= i.today) reasons.push("no_checkin_2w");
    if (reasons.length) out.push({ clientId: c.clientId, reasons });
  }
  return out;
}
