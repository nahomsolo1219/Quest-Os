// Clients and onboarding (module 1): lead capture, client list, client page, edits, accounts, conflicts.
// Every function authorizes first; prices, cutoffs and limits come from settings and the domain.
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  areas, auditLog, checkins, clientAddons, clientSwaps, clients, consultations, invoices, nutritionProfiles, orderDays, orderMeals,
  packages, pauses, payments, subscriptions, swapRules, user, weeklyOrders,
} from "@db/schema";
import { assertCan, can } from "@/server/authz";
import { createClientUser, setUserPassword } from "@/server/auth";
import { findConflicts, conflictText } from "@/domain/swaps";
import { suggestNutrition, type NutritionSuggestion } from "@/domain/nutrition";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { changeEffectiveWeek, menuForDate } from "@/domain/schedule";
import { addDays } from "@/domain/time";
import type { Activity, ClientStatus, DateStr, Goal, LeadSource, MenuCode, Sex, Slot } from "@/domain/types";
import { writeAudit } from "./audit";
import { loadClientPlanInputs } from "./client-plan";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { loadMenuData } from "./menu-data";
import { rotationWeek } from "./pricing";
import { loadSettings } from "./settings";
import { currentSubscription } from "./subscriptions";

// ---------------------------------------------------------------------------------------------
// Lead capture

export type LeadInput = { firstName: string; lastName: string; phone: string; source: LeadSource; notes?: string | null };

/** Staff lead capture (CLI-01): a client with status lead. Phone normalised to E.164; one client per phone. */
export async function createLead(ctx: Ctx, input: LeadInput) {
  assertCan(ctx.actor, "clients.createLead");
  if (!ctx.actor) throw new ServiceError("Please sign in.");
  const phone = normalizeEthiopianPhone(input.phone);
  if (!phone) throw new ServiceError("Enter an Ethiopian mobile number starting 09 or 07.", "phone_invalid");
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  if (!firstName || !lastName) throw new ServiceError("Enter the first and last name.");
  const [dupe] = await ctx.db.select({ id: clients.id, firstName: clients.firstName, lastName: clients.lastName }).from(clients).where(eq(clients.phone, phone));
  if (dupe) throw new ServiceError(`${dupe.firstName} ${dupe.lastName} already has this phone number.`, "phone_taken");
  const [row] = await ctx.db.insert(clients).values({
    firstName, lastName, phone, status: "lead", leadSource: input.source, leadNotes: input.notes?.trim() || null,
  }).onConflictDoNothing().returning();
  if (!row) throw new ServiceError("A client with this phone number already exists.", "phone_taken");
  await writeAudit(ctx.db, ctx.actor, { action: "client.create_lead", entity: "clients", entityId: row.id, after: { firstName, lastName, phone, source: input.source } });
  return row;
}

// ---------------------------------------------------------------------------------------------
// Client list

export type PaymentState = "paid" | "due" | "overdue" | "none";

/** paid = every non-void invoice paid; due = an issued invoice not yet past due; overdue = an issued invoice past due (D300). */
export function paymentStateOf(rows: { status: string; dueAt: Date }[], now: Date): PaymentState {
  const live = rows.filter((r) => r.status !== "void");
  if (live.length === 0) return "none";
  const issued = live.filter((r) => r.status === "issued");
  if (issued.some((r) => r.dueAt.getTime() < now.getTime())) return "overdue";
  if (issued.length) return "due";
  return "paid";
}

export type ClientListRow = {
  id: string;
  name: string;
  phone: string;
  status: ClientStatus;
  packageName: string | null;
  packageCode: string | null;
  areaName: string | null;
  payment: PaymentState;
  deliveryOption: string | null;
  profile: string | null;
  provisional: boolean;
  quickStart: boolean;
};

/** Rows for the client table (CLI-04). */
export async function listClients(ctx: Ctx): Promise<ClientListRow[]> {
  assertCan(ctx.actor, "clients.read");
  const [cs, subs, inv, nps] = await Promise.all([
    ctx.db.select({ c: clients, areaName: areas.name }).from(clients).leftJoin(areas, eq(areas.id, clients.areaId)).orderBy(clients.firstName, clients.lastName),
    ctx.db.select({ s: subscriptions, pkgName: packages.name, pkgCode: packages.code }).from(subscriptions)
      .innerJoin(packages, eq(packages.id, subscriptions.packageId)).orderBy(desc(subscriptions.createdAt)),
    ctx.db.select({ clientId: invoices.clientId, status: invoices.status, dueAt: invoices.dueAt }).from(invoices),
    ctx.db.select().from(nutritionProfiles).where(eq(nutritionProfiles.isCurrent, true)),
  ]);
  return cs.map(({ c, areaName }) => {
    const sub = subs.find((x) => x.s.clientId === c.id);
    const np = nps.find((p) => p.clientId === c.id);
    return {
      id: c.id,
      name: `${c.firstName} ${c.lastName}`,
      phone: c.phone,
      status: c.status,
      packageName: sub?.pkgName ?? null,
      packageCode: sub?.pkgCode ?? null,
      areaName: areaName ?? null,
      payment: can(ctx.actor, "invoices.read") ? paymentStateOf(inv.filter((i) => i.clientId === c.id), ctx.now) : "none",
      deliveryOption: sub?.s.deliveryOption ?? null,
      profile: np ? `${np.size}-${np.goal === "lean" ? "Lean" : "Build"}` : null,
      provisional: np?.provisional ?? false,
      quickStart: sub?.s.isQuickStart ?? false,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Conflicts

export type MealConflict = { menu: MenuCode; slot: Slot; mealName: string; conflicts: string[] };

/**
 * Allergy / dislike conflicts left in the client's standard week after their swaps (CLI-08), for the week their
 * changes would take effect. One entry per meal (menus repeat across the week).
 */
export async function clientConflicts(ctx: Ctx, clientId: string): Promise<MealConflict[]> {
  assertCan(ctx.actor, "clients.read");
  const [data, settings] = await Promise.all([loadMenuData(ctx.db), loadSettings(ctx.db)]);
  const week = changeEffectiveWeek(ctx.now, settings.schedule);
  const plan = (await loadClientPlanInputs(ctx.db, [clientId], week)).get(clientId);
  if (!plan) throw new ServiceError("Client not found.");
  if (plan.allergies.length === 0 && plan.dislikes.length === 0) return [];
  const days = rotationWeek(data, settings, { profile: plan.profile, swapRuleIds: plan.swapRuleIds, addonSlots: plan.addons.map((a) => a.slot),
    allergies: plan.allergies, dislikes: plan.dislikes }, week);
  const out: MealConflict[] = [];
  const seen = new Set<string>();
  days.forEach((meals, i) => {
    const menu = menuForDate(addDays(week, i), settings.schedule);
    for (const m of meals) {
      if (seen.has(m.mealId)) continue;
      seen.add(m.mealId);
      const found = findConflicts(plan.allergies, plan.dislikes, m, data.ingredients);
      if (found.length) out.push({ menu, slot: m.slot, mealName: m.mealName, conflicts: found.map(conflictText) });
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Client page

function intakeOf(c: typeof clients.$inferSelect) {
  if (!c.sex || !c.age || !c.weightG || !c.heightCm || !c.activity || !c.goal) return null;
  return { sex: c.sex, age: c.age, weightKg: c.weightG / 1000, heightCm: c.heightCm, activity: c.activity, goal: c.goal };
}

/** The calculator's suggestion from the client's body stats, or null while stats are missing. */
export async function suggestionFor(ctx: Ctx, c: typeof clients.$inferSelect): Promise<NutritionSuggestion | null> {
  const intake = intakeOf(c);
  if (!intake) return null;
  const s = await loadSettings(ctx.db);
  return suggestNutrition(intake, s.nutrition);
}

/** Everything the client page shows (CLI-05). Sections the actor may not read come back empty. */
export async function getClientDetail(ctx: Ctx, clientId: string) {
  assertCan(ctx.actor, "clients.read");
  const [row] = await ctx.db.select({ c: clients, areaName: areas.name }).from(clients).leftJoin(areas, eq(areas.id, clients.areaId)).where(eq(clients.id, clientId));
  if (!row) throw new ServiceError("Client not found.", "not_found");
  const c = row.c;
  const settings = await loadSettings(ctx.db);
  const canMoney = can(ctx.actor, "invoices.read");
  const [np, suggestion, sub, swaps, addons, orders, checkinRows, consults, account] = await Promise.all([
    ctx.db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, clientId), eq(nutritionProfiles.isCurrent, true))).then((r) => r[0] ?? null),
    suggestionFor(ctx, c),
    currentSubscription(ctx.db, clientId),
    ctx.db.select({ s: clientSwaps, label: swapRules.label }).from(clientSwaps).leftJoin(swapRules, eq(swapRules.id, clientSwaps.swapRuleId))
      .where(eq(clientSwaps.clientId, clientId)).orderBy(desc(clientSwaps.createdAt)),
    ctx.db.select().from(clientAddons).where(eq(clientAddons.clientId, clientId)).orderBy(desc(clientAddons.createdAt)),
    ctx.db.select().from(weeklyOrders).where(eq(weeklyOrders.clientId, clientId)).orderBy(desc(weeklyOrders.weekStart)).limit(8),
    ctx.db.select().from(checkins).where(eq(checkins.clientId, clientId)).orderBy(desc(checkins.checkinDate)).limit(20),
    ctx.db.select({ k: consultations, by: user.name }).from(consultations).leftJoin(user, eq(user.id, consultations.byUserId))
      .where(eq(consultations.clientId, clientId)).orderBy(desc(consultations.heldAt)),
    c.userId ? ctx.db.select({ id: user.id, phone: user.phoneNumber, email: user.email }).from(user).where(eq(user.id, c.userId)).then((r) => r[0] ?? null) : null,
  ]);
  const [pkg, pauseRows] = sub
    ? await Promise.all([
        ctx.db.select().from(packages).where(eq(packages.id, sub.packageId)).then((r) => r[0] ?? null),
        ctx.db.select().from(pauses).where(eq(pauses.subscriptionId, sub.id)).orderBy(desc(pauses.startWeek)),
      ])
    : [null, []];
  const orderConflicts = orders.length ? await ctx.db.select({ weeklyOrderId: orderDays.weeklyOrderId, conflicts: orderMeals.conflicts }).from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .where(and(inArray(orderDays.weeklyOrderId, orders.map((o) => o.id)), sql`cardinality(${orderMeals.conflicts}) > 0`)) : [];
  const orderMealCounts = orders.length ? await ctx.db.select({ weeklyOrderId: orderDays.weeklyOrderId, days: sql<number>`count(*)::int` }).from(orderDays)
    .where(inArray(orderDays.weeklyOrderId, orders.map((o) => o.id))).groupBy(orderDays.weeklyOrderId) : [];

  let invoiceRows: (typeof invoices.$inferSelect & { payments: (typeof payments.$inferSelect)[] })[] = [];
  if (canMoney) {
    const inv = await ctx.db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.periodStart));
    const pays = inv.length ? await ctx.db.select().from(payments).where(inArray(payments.invoiceId, inv.map((i) => i.id))).orderBy(desc(payments.submittedAt)) : [];
    invoiceRows = inv.map((i) => ({ ...i, payments: pays.filter((p) => p.invoiceId === i.id) }));
  }

  let audit: { id: string; action: string; entity: string; before: unknown; after: unknown; reason: string | null; createdAt: Date; actorName: string | null }[] = [];
  if (can(ctx.actor, "audit.read")) {
    const subIds = (await ctx.db.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.clientId, clientId))).map((r) => r.id);
    const payIds = invoiceRows.flatMap((i) => i.payments.map((p) => p.id));
    const conds = [and(eq(auditLog.entity, "clients"), eq(auditLog.entityId, clientId))];
    if (subIds.length) conds.push(and(eq(auditLog.entity, "subscriptions"), inArray(auditLog.entityId, subIds)));
    if (payIds.length) conds.push(and(eq(auditLog.entity, "payments"), inArray(auditLog.entityId, payIds)));
    audit = await ctx.db.select({ id: auditLog.id, action: auditLog.action, entity: auditLog.entity, before: auditLog.before, after: auditLog.after,
      reason: auditLog.reason, createdAt: auditLog.createdAt, actorName: user.name }).from(auditLog).leftJoin(user, eq(user.id, auditLog.actorUserId))
      .where(or(...conds)).orderBy(desc(auditLog.createdAt)).limit(100);
  }

  const conflicts = await clientConflicts(ctx, clientId);
  const today = ctx.now;
  return {
    client: c,
    areaName: row.areaName ?? null,
    account,
    nutrition: np,
    suggestion,
    subscription: sub,
    package: pkg,
    pauses: pauseRows,
    swaps: swaps.map((s) => ({ ...s.s, label: s.label ?? s.s.customRequest ?? "Custom request" })),
    addons,
    invoices: invoiceRows,
    payment: canMoney ? paymentStateOf(invoiceRows, today) : ("none" as PaymentState),
    orders: orders.map((o) => ({
      ...o,
      days: orderMealCounts.find((x) => x.weeklyOrderId === o.id)?.days ?? 0,
      conflicts: [...new Set(orderConflicts.filter((x) => x.weeklyOrderId === o.id).flatMap((x) => x.conflicts))],
    })),
    checkins: checkinRows,
    consultations: consults.map((x) => ({ ...x.k, byName: x.by })),
    audit,
    conflicts,
    changeEffectiveWeek: changeEffectiveWeek(ctx.now, settings.schedule),
    canMoney,
  };
}

export type ClientDetail = Awaited<ReturnType<typeof getClientDetail>>;

// ---------------------------------------------------------------------------------------------
// Edits

export type ClientUpdate = Partial<{
  firstName: string;
  lastName: string;
  address: string | null;
  areaId: string | null;
  landmark: string | null;
  notes: string | null;
  allergies: string[];
  dislikes: string[];
  sex: Sex | null;
  age: number | null;
  weightG: number | null;
  heightCm: number | null;
  activity: Activity | null;
  goal: Goal | null;
  checkInWeekday: number | null;
}>;

const BODY_FIELDS = new Set(["sex", "age", "weightG", "heightCm", "activity", "goal", "notes"]);
/** Fields that change what is cooked or where it goes: they enter at the next weekly lock (business rule 2). */
const NEXT_LOCK_FIELDS = new Set(["address", "areaId", "landmark", "allergies", "dislikes"]);

const cleanList = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * Saves client fields with an audit row (before/after of the changed fields). Address, area, landmark, allergies and
 * dislikes take effect from `effectiveWeek` (the lock snapshots the address into drops; locked weeks keep theirs).
 */
export async function updateClient(ctx: Ctx, clientId: string, fields: ClientUpdate) {
  const keys = Object.keys(fields).filter((k) => (fields as Record<string, unknown>)[k] !== undefined) as (keyof ClientUpdate)[];
  if (keys.length === 0) throw new ServiceError("Nothing to save.");
  const onlyBody = keys.every((k) => BODY_FIELDS.has(k));
  assertCan(ctx.actor, onlyBody ? "clients.writeBodyStats" : "clients.write");
  const [before] = await ctx.db.select().from(clients).where(eq(clients.id, clientId));
  if (!before) throw new ServiceError("Client not found.", "not_found");
  const next: ClientUpdate = { ...fields };
  if (next.firstName !== undefined && !next.firstName.trim()) throw new ServiceError("First name cannot be empty.");
  if (next.lastName !== undefined && !next.lastName.trim()) throw new ServiceError("Last name cannot be empty.");
  if (next.firstName) next.firstName = next.firstName.trim();
  if (next.lastName) next.lastName = next.lastName.trim();
  for (const k of ["address", "landmark", "notes"] as const) if (typeof next[k] === "string") next[k] = (next[k] as string).trim() || null;
  if (next.allergies) next.allergies = cleanList(next.allergies);
  if (next.dislikes) next.dislikes = cleanList(next.dislikes);
  if (next.age != null && (!Number.isInteger(next.age) || next.age < 12 || next.age > 100)) throw new ServiceError("Age must be 12 to 100 years.");
  if (next.weightG != null && (!Number.isInteger(next.weightG) || next.weightG < 30000 || next.weightG > 300000)) throw new ServiceError("Weight must be 30 to 300 kg.");
  if (next.heightCm != null && (!Number.isInteger(next.heightCm) || next.heightCm < 120 || next.heightCm > 230)) throw new ServiceError("Height must be 120 to 230 cm.");
  if (next.checkInWeekday != null && (!Number.isInteger(next.checkInWeekday) || next.checkInWeekday < 1 || next.checkInWeekday > 7)) throw new ServiceError("Choose a check-in day.");
  if (next.areaId) {
    const [a] = await ctx.db.select({ id: areas.id }).from(areas).where(eq(areas.id, next.areaId));
    if (!a) throw new ServiceError("Choose an area from the list.");
  }
  const changed: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of keys) {
    const b = (before as Record<string, unknown>)[k];
    const a = (next as Record<string, unknown>)[k];
    if (JSON.stringify(b ?? null) !== JSON.stringify(a ?? null)) changed[k] = { before: b ?? null, after: a ?? null };
  }
  const settings = await loadSettings(ctx.db);
  const effectiveWeek: DateStr = changeEffectiveWeek(ctx.now, settings.schedule);
  if (Object.keys(changed).length === 0) return { changed: [] as string[], effectiveWeek: null };
  await ctx.db.update(clients).set({ ...(Object.fromEntries(Object.keys(changed).map((k) => [k, (next as Record<string, unknown>)[k]])) as ClientUpdate), updatedAt: ctx.now })
    .where(eq(clients.id, clientId));
  await writeAudit(ctx.db, ctx.actor, {
    action: "client.update", entity: "clients", entityId: clientId,
    before: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.before])),
    after: Object.fromEntries(Object.entries(changed).map(([k, v]) => [k, v.after])),
  });
  const atLock = Object.keys(changed).some((k) => NEXT_LOCK_FIELDS.has(k));
  return { changed: Object.keys(changed), effectiveWeek: atLock ? effectiveWeek : null };
}

// ---------------------------------------------------------------------------------------------
// Onboarding: provisional nutrition profile from the calculator

/**
 * If the client has no current nutrition profile, saves the calculator's suggestion as a provisional profile
 * (set_by null, provisional true); the nutritionist confirms or adjusts it later (quick start step 3, D302).
 */
export async function ensureProvisionalProfile(ctx: Ctx, clientId: string) {
  assertCan(ctx.actor, "clients.write");
  const [c] = await ctx.db.select().from(clients).where(eq(clients.id, clientId));
  if (!c) throw new ServiceError("Client not found.", "not_found");
  const [existing] = await ctx.db.select().from(nutritionProfiles).where(and(eq(nutritionProfiles.clientId, clientId), eq(nutritionProfiles.isCurrent, true)));
  if (existing) return { profile: existing, created: false };
  const sug = await suggestionFor(ctx, c);
  if (!sug) throw new ServiceError("Fill in sex, age, weight, height, activity and goal first.");
  const [np] = await ctx.db.insert(nutritionProfiles).values({
    clientId, bmr: sug.bmr, tdee: sug.tdee, suggestedKcal: sug.targetKcal, suggestedSize: sug.size,
    suggestedProteinG: sug.proteinG, suggestedCarbG: sug.carbG, suggestedFatG: sug.fatG,
    kcalTarget: sug.sizeKcal, size: sug.size, goal: c.goal!, proteinG: sug.proteinG, carbG: sug.carbG, fatG: sug.fatG,
    isOverride: false, provisional: true, setByUserId: null, setAt: ctx.now, isCurrent: true,
  }).onConflictDoNothing().returning();
  if (!np) throw new ServiceError("A nutrition profile was just saved by someone else. Reload the page.");
  await writeAudit(ctx.db, ctx.actor, { action: "nutrition.provisional", entity: "clients", entityId: clientId,
    after: { size: sug.size, kcal: sug.sizeKcal, proteinG: sug.proteinG, carbG: sug.carbG, fatG: sug.fatG, provisional: true } });
  return { profile: np, created: true };
}

// ---------------------------------------------------------------------------------------------
// Accounts

/** Creates a phone + password sign-in for a client without one (walk-ins) and links it. */
export async function createClientAccount(ctx: Ctx, clientId: string, password: string) {
  assertCan(ctx.actor, "clients.resetPassword");
  if (password.length < 8) throw new ServiceError("Password must be at least 8 characters.");
  const [c] = await ctx.db.select().from(clients).where(eq(clients.id, clientId));
  if (!c) throw new ServiceError("Client not found.", "not_found");
  if (c.userId) throw new ServiceError("This client already has an account. Reset the password instead.");
  const [taken] = await ctx.db.select({ id: user.id }).from(user).where(eq(user.phoneNumber, c.phone));
  if (taken) throw new ServiceError("Another account already uses this phone number.", "phone_taken");
  const u = await createClientUser(ctx.db, { name: `${c.firstName} ${c.lastName}`, phone: c.phone, password, isDemo: c.isDemo });
  await ctx.db.update(clients).set({ userId: u.id }).where(eq(clients.id, clientId));
  await writeAudit(ctx.db, ctx.actor, { action: "client.create_account", entity: "clients", entityId: clientId, after: { userId: u.id } });
  return { userId: u.id };
}

/** Staff reset a client's password (AUTH-03, D012). The audit row never contains the password. */
export async function resetClientPassword(ctx: Ctx, clientId: string, newPassword: string) {
  assertCan(ctx.actor, "clients.resetPassword");
  if (newPassword.length < 8) throw new ServiceError("Password must be at least 8 characters.");
  const [c] = await ctx.db.select().from(clients).where(eq(clients.id, clientId));
  if (!c) throw new ServiceError("Client not found.", "not_found");
  if (!c.userId) throw new ServiceError("This client has no account yet. Create one first.");
  await setUserPassword(ctx.db, c.userId, newPassword);
  await writeAudit(ctx.db, ctx.actor, { action: "client.reset_password", entity: "clients", entityId: clientId, after: { by: actorUserId(ctx.actor) } });
}

/** Areas for forms. */
export async function listAreas(ctx: Ctx) {
  assertCan(ctx.actor, "areas.read");
  return ctx.db.select().from(areas).where(eq(areas.active, true)).orderBy(areas.sort, areas.name);
}
