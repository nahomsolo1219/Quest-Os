// Nutritionist area: intake queue, consultations, nutrition targets (NUT-06, NUT-08), swap approvals (SWP-05), check-ins (CHK-01).
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  checkins, clientSwaps, clients, consultations, nutritionProfiles, packages, profileDayResults, profilePortions, subscriptions, swapRules, user,
} from "@db/schema";
import { assertCan, can } from "@/server/authz";
import { macroGrams, suggestNutrition, type NutritionSuggestion } from "@/domain/nutrition";
import { changeEffectiveWeek } from "@/domain/schedule";
import { countStandingSwaps } from "@/domain/swaps";
import { addDays, addisDate, maxDate } from "@/domain/time";
import { mealMacros, resolveMeal, roundMacros, SLOT_ORDER } from "@/domain/recipes";
import { GOALS, PROFILES, SIZES, type DateStr, type Goal, type MenuCode, type Size } from "@/domain/types";
import { writeAudit } from "./audit";
import { repriceForPlanChange } from "./subscriptions";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { notify } from "./notifications";
import { loadMenuData } from "./menu-data";
import { loadSettings } from "./settings";

const HOUR = 3600_000;

type ClientRow = typeof clients.$inferSelect;

/** The domain suggestion for a client, or null when body stats are incomplete. */
export function suggestionFor(c: Pick<ClientRow, "sex" | "age" | "weightG" | "heightCm" | "activity" | "goal">,
  s: Awaited<ReturnType<typeof loadSettings>>["nutrition"], goalOverride?: Goal): NutritionSuggestion | null {
  const goal = goalOverride ?? c.goal;
  if (!c.sex || !c.age || !c.weightG || !c.heightCm || !c.activity || !goal) return null;
  return suggestNutrition({ sex: c.sex, age: c.age, weightKg: c.weightG / 1000, heightCm: c.heightCm, activity: c.activity, goal }, s);
}

/** Intake review queue: clients without targets, provisional quick-start profiles (confirm within N hours), flagged profile days, swap requests. */
export async function intakeQueue(ctx: Ctx) {
  assertCan(ctx.actor, "nutrition.read");
  const settings = await loadSettings(ctx.db);
  const confirmHours = settings.schedule.quickStartConfirmHours;
  const [allClients, current, flagged, requested] = await Promise.all([
    ctx.db.select().from(clients).orderBy(asc(clients.firstName), asc(clients.lastName)),
    ctx.db.select().from(nutritionProfiles).where(eq(nutritionProfiles.isCurrent, true)),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(profileDayResults).where(eq(profileDayResults.flagged, true)),
    ctx.db.select({ n: sql<number>`count(*)::int` }).from(clientSwaps).where(eq(clientSwaps.status, "requested")),
  ]);
  const byClient = new Map(current.map((p) => [p.clientId, p]));
  const noProfile = allClients
    .filter((c) => c.status !== "ended" && !byClient.has(c.id))
    .map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, status: c.status, statsComplete: suggestionFor(c, settings.nutrition) !== null }));
  const provisional = current
    .filter((p) => p.provisional)
    .map((p) => {
      const c = allClients.find((x) => x.id === p.clientId)!;
      const deadline = new Date(p.setAt.getTime() + confirmHours * HOUR);
      const hoursLeft = Math.floor((deadline.getTime() - ctx.now.getTime()) / HOUR);
      return { clientId: p.clientId, firstName: c.firstName, lastName: c.lastName, size: p.size, goal: p.goal, kcalTarget: p.kcalTarget,
        setAt: p.setAt, deadline, hoursLeft, overdue: deadline.getTime() <= ctx.now.getTime() };
    })
    .sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
  const everyone = allClients.filter((c) => c.status !== "ended").map((c) => {
    const p = byClient.get(c.id);
    return { id: c.id, firstName: c.firstName, lastName: c.lastName, status: c.status,
      profile: p ? { size: p.size, goal: p.goal, kcalTarget: p.kcalTarget, provisional: p.provisional, isOverride: p.isOverride } : null };
  });
  return { noProfile, provisional, flaggedDays: flagged[0]?.n ?? 0, swapRequests: requested[0]?.n ?? 0, confirmHours, clients: everyone };
}

/** Everything the nutritionist client page shows. */
export async function clientNutrition(ctx: Ctx, clientId: string) {
  assertCan(ctx.actor, "nutrition.read");
  const [c] = await ctx.db.select().from(clients).where(eq(clients.id, clientId));
  if (!c) throw new ServiceError("That client was not found.");
  const settings = await loadSettings(ctx.db);
  const setBy = user;
  const [profiles, consults, checks, swaps, subs] = await Promise.all([
    ctx.db.select({ p: nutritionProfiles, setByName: setBy.name }).from(nutritionProfiles)
      .leftJoin(setBy, eq(setBy.id, nutritionProfiles.setByUserId))
      .where(eq(nutritionProfiles.clientId, clientId)).orderBy(desc(nutritionProfiles.setAt)),
    ctx.db.select({ c: consultations, byName: user.name }).from(consultations).leftJoin(user, eq(user.id, consultations.byUserId))
      .where(eq(consultations.clientId, clientId)).orderBy(desc(consultations.heldAt)),
    checkinRows(ctx, clientId),
    ctx.db.select({ s: clientSwaps, label: swapRules.label }).from(clientSwaps).leftJoin(swapRules, eq(swapRules.id, clientSwaps.swapRuleId))
      .where(eq(clientSwaps.clientId, clientId)).orderBy(desc(clientSwaps.createdAt)),
    ctx.db.select({ s: subscriptions, pkg: packages.name, swapLimit: packages.swapLimit }).from(subscriptions)
      .innerJoin(packages, eq(packages.id, subscriptions.packageId))
      .where(and(eq(subscriptions.clientId, clientId), inArray(subscriptions.status, ["active", "paused", "pending_payment"])))
      .orderBy(desc(subscriptions.startDate)).limit(1),
  ]);
  return {
    client: c,
    suggestion: suggestionFor(c, settings.nutrition),
    current: profiles.find((r) => r.p.isCurrent) ?? null,
    history: profiles,
    consultations: consults,
    checkins: checks,
    swaps,
    subscription: subs[0] ?? null,
    effectiveWeek: changeEffectiveWeek(ctx.now, settings.schedule),
    /** standard targets per goal and size (what "change size" fills in) */
    presets: Object.fromEntries(GOALS.map((g) => [g, Object.fromEntries(SIZES.map((z) => {
      const kcal = settings.nutrition.sizeKcal[z];
      return [z, { kcal, ...macroGrams(kcal, g, settings.nutrition) }];
    }))])) as Record<Goal, Record<Size, { kcal: number; proteinG: number; carbG: number; fatG: number }>>,
    canWrite: can(ctx.actor, "nutrition.write"),
  };
}

export async function recordConsultation(ctx: Ctx, input: { clientId: string; heldAt: Date; mode: "in_person" | "phone"; notes?: string | null }) {
  assertCan(ctx.actor, "consultations.write");
  const [c] = await ctx.db.select({ id: clients.id }).from(clients).where(eq(clients.id, input.clientId));
  if (!c) throw new ServiceError("That client was not found.");
  if (input.heldAt.getTime() > ctx.now.getTime() + HOUR) throw new ServiceError("A consultation cannot be in the future.");
  const [row] = await ctx.db.insert(consultations).values({
    clientId: input.clientId, heldAt: input.heldAt, mode: input.mode, notes: input.notes?.trim() || null, byUserId: actorUserId(ctx.actor),
  }).returning();
  return row;
}

export type SetNutritionInput = {
  clientId: string; size: Size; goal?: Goal; kcalTarget: number; proteinG: number; carbG: number; fatG: number; note?: string | null;
};

/**
 * Nutritionist sets size and targets (NUT-06). Stores the calculator suggestion next to the set values, flags an override,
 * records who and when, makes it the only current profile and clears provisional. Takes effect from the next lockable week.
 */
export async function setNutrition(ctx: Ctx, input: SetNutritionInput) {
  assertCan(ctx.actor, "nutrition.write");
  const settings = await loadSettings(ctx.db);
  const [c] = await ctx.db.select().from(clients).where(eq(clients.id, input.clientId));
  if (!c) throw new ServiceError("That client was not found.");
  const goal: Goal | null = input.goal ?? c.goal;
  if (!goal) throw new ServiceError("Set the client's goal (Lean or Build) first.");
  const sug = suggestionFor(c, settings.nutrition, goal);
  if (!sug) throw new ServiceError("Body stats are incomplete: add sex, age, weight, height and activity before setting targets.");
  for (const [k, v, max] of [["Calories", input.kcalTarget, 6000], ["Protein", input.proteinG, 600], ["Carbs", input.carbG, 900], ["Fat", input.fatG, 400]] as const) {
    if (!Number.isInteger(v) || v <= 0 || v > max) throw new ServiceError(`${k} must be a whole number between 1 and ${max}.`);
  }
  const isOverride = input.size !== sug.size || input.kcalTarget !== sug.sizeKcal || input.proteinG !== sug.proteinG
    || input.carbG !== sug.carbG || input.fatG !== sug.fatG;
  const effectiveWeek = changeEffectiveWeek(ctx.now, settings.schedule);

  return ctx.db.transaction(async (tx) => {
    const [before] = await tx.select().from(nutritionProfiles)
      .where(and(eq(nutritionProfiles.clientId, c.id), eq(nutritionProfiles.isCurrent, true)));
    await tx.update(nutritionProfiles).set({ isCurrent: false, updatedAt: ctx.now })
      .where(and(eq(nutritionProfiles.clientId, c.id), eq(nutritionProfiles.isCurrent, true)));
    const [row] = await tx.insert(nutritionProfiles).values({
      clientId: c.id, bmr: sug.bmr, tdee: sug.tdee, suggestedKcal: sug.targetKcal, suggestedSize: sug.size,
      suggestedProteinG: sug.proteinG, suggestedCarbG: sug.carbG, suggestedFatG: sug.fatG,
      kcalTarget: input.kcalTarget, size: input.size, goal, proteinG: input.proteinG, carbG: input.carbG, fatG: input.fatG,
      isOverride, provisional: false, setByUserId: actorUserId(ctx.actor), setAt: ctx.now, isCurrent: true,
    }).returning();
    if (goal !== c.goal) await tx.update(clients).set({ goal, updatedAt: ctx.now }).where(eq(clients.id, c.id));
    const pick = (p?: typeof row) => p ? { size: p.size, goal: p.goal, kcalTarget: p.kcalTarget, proteinG: p.proteinG, carbG: p.carbG, fatG: p.fatG, provisional: p.provisional } : null;
    await writeAudit(tx, ctx.actor, {
      action: "nutrition.set", entity: "nutrition_profiles", entityId: c.id, before: pick(before),
      after: { ...pick(row), isOverride, suggestion: { size: sug.size, kcal: sug.sizeKcal, targetKcal: sug.targetKcal, proteinG: sug.proteinG, carbG: sug.carbG, fatG: sug.fatG }, effectiveWeek },
      reason: input.note?.trim() || null,
    });
    if (c.userId && (!before || before.size !== row.size || before.goal !== row.goal || before.kcalTarget !== row.kcalTarget)) {
      await notify(tx, {
        userIds: [c.userId], kind: "nutrition.set", title: "Your nutrition targets were updated",
        body: `${row.size} ${row.goal === "lean" ? "Lean" : "Build"}, ${row.kcalTarget} kcal a day, from the week of ${effectiveWeek}.`,
        link: "/app/plan", dedupeKey: `nutrition-set:${row.id}`,
      });
    }
    return { profile: row, isOverride, effectiveWeek };
  });
}

/** Swap requests waiting for the nutritionist (custom requests outside the table, or table swaps beyond the limit). */
export async function swapApprovals(ctx: Ctx) {
  assertCan(ctx.actor, "swaps.approve");
  const rows = await ctx.db.select({ s: clientSwaps, firstName: clients.firstName, lastName: clients.lastName, allergies: clients.allergies,
    dislikes: clients.dislikes, ruleLabel: swapRules.label, requestedBy: user.name })
    .from(clientSwaps).innerJoin(clients, eq(clients.id, clientSwaps.clientId))
    .leftJoin(swapRules, eq(swapRules.id, clientSwaps.swapRuleId)).leftJoin(user, eq(user.id, clientSwaps.requestedByUserId))
    .where(eq(clientSwaps.status, "requested")).orderBy(asc(clientSwaps.createdAt));
  const clientIds = [...new Set(rows.map((r) => r.s.clientId))];
  const [allSwaps, subs, rules] = await Promise.all([
    clientIds.length ? ctx.db.select().from(clientSwaps).where(inArray(clientSwaps.clientId, clientIds)) : Promise.resolve([]),
    clientIds.length ? ctx.db.select({ clientId: subscriptions.clientId, swapLimit: packages.swapLimit, pkg: packages.name }).from(subscriptions)
      .innerJoin(packages, eq(packages.id, subscriptions.packageId))
      .where(and(inArray(subscriptions.clientId, clientIds), inArray(subscriptions.status, ["active", "paused", "pending_payment"]))) : Promise.resolve([]),
    ctx.db.select({ id: swapRules.id, label: swapRules.label }).from(swapRules).where(eq(swapRules.active, true)).orderBy(asc(swapRules.sort)),
  ]);
  const settings = await loadSettings(ctx.db);
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  return {
    rules,
    effectiveWeek: week,
    requests: rows.map((r) => {
      const sub = subs.find((x) => x.clientId === r.s.clientId);
      const standing = countStandingSwaps(allSwaps.filter((x) => x.clientId === r.s.clientId).filter((x) => x.status === "approved"), week);
      return { ...r, packageName: sub?.pkg ?? null, swapLimit: sub?.swapLimit ?? null, standing };
    }),
  };
}

/** Approve or reject a requested swap. Approving a custom request may map it to a swap-table rule. Audited. */
export async function decideSwap(ctx: Ctx, input: { id: string; approve: boolean; note?: string | null; swapRuleId?: string | null }) {
  assertCan(ctx.actor, "swaps.approve");
  const [row] = await ctx.db.select().from(clientSwaps).where(eq(clientSwaps.id, input.id));
  if (!row) throw new ServiceError("That swap request was not found.");
  if (row.status !== "requested") throw new ServiceError("This request was already decided.");
  if (!input.approve && !input.note?.trim()) throw new ServiceError("Write a short reason for the client when rejecting.");
  let swapRuleId = row.swapRuleId;
  if (input.approve && input.swapRuleId) {
    const [rule] = await ctx.db.select().from(swapRules).where(eq(swapRules.id, input.swapRuleId));
    if (!rule || !rule.active) throw new ServiceError("That swap rule is not active.");
    swapRuleId = rule.id;
  }
  const settings = await loadSettings(ctx.db);
  const effectiveWeekStart = maxDate(row.effectiveWeekStart, changeEffectiveWeek(ctx.now, settings.schedule));
  const next = {
    status: input.approve ? ("approved" as const) : ("rejected" as const), swapRuleId, note: input.note?.trim() || null,
    decidedByUserId: actorUserId(ctx.actor), decidedAt: ctx.now, effectiveWeekStart: input.approve ? effectiveWeekStart : row.effectiveWeekStart,
  };
  const decided = await ctx.db.transaction(async (tx) => {
    const [updated] = await tx.update(clientSwaps).set({ ...next, updatedAt: ctx.now }).where(and(eq(clientSwaps.id, row.id), eq(clientSwaps.status, "requested"))).returning();
    if (!updated) throw new ServiceError("This request was already decided.");
    await writeAudit(tx, ctx.actor, { action: input.approve ? "swap.approve" : "swap.reject", entity: "client_swaps", entityId: row.id,
      before: { status: row.status, swapRuleId: row.swapRuleId, customRequest: row.customRequest }, after: next, reason: next.note });
    const [c] = await tx.select({ userId: clients.userId }).from(clients).where(eq(clients.id, row.clientId));
    if (c?.userId) {
      await notify(tx, { userIds: [c.userId], kind: "swap.decided", dedupeKey: `swap-decided:${row.id}`, link: "/app/swaps",
        title: input.approve ? "Your swap request was approved" : "Your swap request was not approved",
        body: input.approve ? `It starts from the week of ${effectiveWeekStart}.` : (next.note ?? "") });
    }
    return updated;
  });
  // an approved "price difference" swap changes what the client is cooked, so the plan price follows (D040)
  if (input.approve && swapRuleId) {
    const [rule] = await ctx.db.select().from(swapRules).where(eq(swapRules.id, swapRuleId));
    if (rule?.costMode === "price_difference") await repriceForPlanChange(ctx, row.clientId, effectiveWeekStart, `Swap ${rule.code} approved`);
  }
  return decided;
}

export async function logCheckin(ctx: Ctx, input: { clientId: string; date: DateStr; weightG?: number | null; adherencePct?: number | null; notes?: string | null }) {
  assertCan(ctx.actor, "checkins.write");
  const [c] = await ctx.db.select({ id: clients.id, isDemo: clients.isDemo }).from(clients).where(eq(clients.id, input.clientId));
  if (!c) throw new ServiceError("That client was not found.");
  if (input.date > addisDate(ctx.now)) throw new ServiceError("A check-in cannot be in the future.");
  if (input.weightG == null && input.adherencePct == null && !input.notes?.trim()) throw new ServiceError("Enter a weight, adherence or a note.");
  if (input.weightG != null && (input.weightG < 25_000 || input.weightG > 300_000)) throw new ServiceError("Weight must be between 25 and 300 kg.");
  if (input.adherencePct != null && (input.adherencePct < 0 || input.adherencePct > 100)) throw new ServiceError("Adherence must be between 0 and 100%.");
  const [row] = await ctx.db.insert(checkins).values({
    clientId: c.id, checkinDate: input.date, weightG: input.weightG ?? null, adherencePct: input.adherencePct ?? null,
    notes: input.notes?.trim() || null, byUserId: actorUserId(ctx.actor), source: "nutritionist", isDemo: c.isDemo,
  }).returning();
  return row;
}

async function checkinRows(ctx: Ctx, clientId?: string, limit = 100) {
  return ctx.db.select({ c: checkins, firstName: clients.firstName, lastName: clients.lastName, byName: user.name })
    .from(checkins).innerJoin(clients, eq(clients.id, checkins.clientId)).leftJoin(user, eq(user.id, checkins.byUserId))
    .where(clientId ? eq(checkins.clientId, clientId) : undefined)
    .orderBy(desc(checkins.checkinDate), desc(checkins.createdAt)).limit(limit);
}

/** Recent check-ins (optionally one client) and active clients with no check-in for 14 days. */
export async function checkinList(ctx: Ctx, input: { clientId?: string } = {}) {
  assertCan(ctx.actor, "checkins.read");
  const today = addisDate(ctx.now);
  const [recent, active, lasts, starts] = await Promise.all([
    checkinRows(ctx, input.clientId),
    ctx.db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName, checkInWeekday: clients.checkInWeekday })
      .from(clients).where(eq(clients.status, "active")).orderBy(asc(clients.firstName)),
    ctx.db.select({ clientId: checkins.clientId, last: sql<string>`max(${checkins.checkinDate})::text` }).from(checkins).groupBy(checkins.clientId),
    ctx.db.select({ clientId: subscriptions.clientId, start: sql<string>`min(${subscriptions.startDate})::text` }).from(subscriptions)
      .where(sql`${subscriptions.status} <> 'cancelled'`).groupBy(subscriptions.clientId),
  ]);
  const overdue = active.map((c) => {
    const last = lasts.find((l) => l.clientId === c.id)?.last ?? null;
    const ref = last ?? starts.find((s) => s.clientId === c.id)?.start ?? today;
    return { ...c, last, overdue: addDays(ref, 14) <= today };
  }).filter((c) => c.overdue);
  return { recent, overdue, clients: active, today };
}


/**
 * Profile table for one menu (A–D, or "extra" for replacement meals): parts × six profiles with qty, computed qty and manual flag,
 * per-meal macros per profile (domain mealMacros of resolveMeal at the profile portions), and the day results per profile.
 */
export async function profileTable(ctx: Ctx, menu: MenuCode | "extra") {
  assertCan(ctx.actor, "portions.read");
  const [data, cells, days] = await Promise.all([
    loadMenuData(ctx.db),
    ctx.db.select().from(profilePortions),
    ctx.db.select().from(profileDayResults).where(menu === "extra" ? undefined : eq(profileDayResults.menu, menu)),
  ]);
  const cellBy = new Map(cells.map((c) => [`${c.profile}:${c.partId}`, c]));
  const meals = data.mealList.filter((m) => (menu === "extra" ? m.menu === null : m.menu === menu)).sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
  const ingredientName = (id: string) => data.ingredients[id]?.name ?? "?";
  return {
    menu,
    canEdit: can(ctx.actor, "portions.write"),
    days: PROFILES.map((profile) => {
      const d = days.find((x) => x.profile === profile);
      return { profile, result: d ? { kcal: d.kcal, proteinG: d.proteinG, carbG: d.carbG, fatG: d.fatG, flagged: d.flagged, flagReason: d.flagReason, computedAt: d.computedAt } : null };
    }),
    meals: meals.map((m) => ({
      id: m.id, code: m.code, name: m.name, slot: m.slot,
      parts: [...m.parts].sort((a, b) => a.sort - b.sort).map((p) => ({
        id: p.id, name: p.name, category: p.category, unit: p.unit, baseQty: p.baseQty,
        ingredients: p.ingredients.map((pi) => ingredientName(pi.ingredientId)).join(", "),
        cells: PROFILES.map((profile) => {
          const c = cellBy.get(`${profile}:${p.id}`);
          return { profile, qty: c?.qty ?? null, computedQty: c?.computedQty ?? null, isManual: c?.isManual ?? false };
        }),
      })),
      macros: PROFILES.map((profile) => ({ profile, ...roundMacros(mealMacros(resolveMeal(m, data.portions[profile] ?? {}), data.ingredients)) })),
    })),
  };
}
