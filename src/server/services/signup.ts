// Public sign-up (CLI-02, APP-02, quick start step 3): creates the lead, the client's login (phone + password),
// a provisional nutrition profile from the calculator and, when prices exist, the chosen plan with its first invoice.
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { areas, clients, consultations, nutritionProfiles, packages, subscriptions, user } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { can, ForbiddenError, loadActor } from "@/server/authz";
import { createClientUser } from "@/server/auth";
import { suggestNutrition } from "@/domain/nutrition";
import { quickStartAmount } from "@/domain/pricing";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { quickStartPlan } from "@/domain/schedule";
import { addisDate } from "@/domain/time";
import { ACTIVITIES, GOALS, LEAD_SOURCES, SEXES, type Activity, type BillingPeriod, type DeliveryOption, type Goal, type Sex } from "@/domain/types";
import { writeAudit } from "./audit";
import { ServiceError, type Ctx } from "./context";
import { quickStartsTakenByDate } from "./orders";
import { quotePrice } from "./pricing";
import { loadSettings } from "./settings";
import { createSubscription } from "./subscriptions";

export type SignUpInput = {
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  sex: Sex;
  age: number;
  weightKg: number;
  heightCm: number;
  activity: Activity;
  goal: Goal;
  allergies: string[];
  dislikes: string[];
  address: string;
  areaId: string | null;
  landmark: string;
  deliveryOption: DeliveryOption;
  /** null = no plan yet (lead + account only) */
  plan: { packageId: string; billingPeriod: BillingPeriod; start: "quick_start" | "next_week" } | null;
  source?: string | null;
};

export type SignUpResult = {
  clientId: string;
  userId: string;
  phone: string;
  size: string;
  /** plan outcome */
  plan:
    | { status: "none" }
    | { status: "created"; startDate: string; amountBirr: number; dueAt: Date; quickStart: boolean; capacityShifted: boolean }
    | { status: "price_missing"; missing: string[] }
    | { status: "failed"; error: string };
};

export const STAFF_LEAD_EXISTS = "The Quest Meals team has already started your plan with this phone number. Call or visit us and we will set up your login.";
export const DUPLICATE_PHONE = "This phone number already has an account — sign in.";

const cleanList = (xs: string[]) => [...new Set(xs.map((x) => x.trim().toLowerCase()).filter(Boolean))].slice(0, 20);

/** Anonymous visitors may sign up (PUBLIC permission clients.createLead). */
export async function signUp(ctx: Ctx, input: SignUpInput): Promise<SignUpResult> {
  if (!can(ctx.actor ?? null, "clients.createLead")) throw new ForbiddenError();
  if (ctx.actor) throw new ServiceError("You are already signed in. Sign out first to create a new account.");
  const phone = normalizeEthiopianPhone(input.phone);
  if (!phone) throw new ServiceError("Enter an Ethiopian mobile number, for example 0911 234 567.");
  if (input.password.length < 8) throw new ServiceError("Password must be at least 8 characters.");
  if (!input.firstName.trim() || !input.lastName.trim()) throw new ServiceError("Enter your first and last name.");
  if (!SEXES.includes(input.sex) || !ACTIVITIES.includes(input.activity) || !GOALS.includes(input.goal)) throw new ServiceError("Check your body stats.");
  if (!(input.age >= 14 && input.age <= 90) || !(input.weightKg >= 30 && input.weightKg <= 250) || !(input.heightCm >= 120 && input.heightCm <= 230)) {
    throw new ServiceError("Check your age (14–90), weight (30–250 kg) and height (120–230 cm).");
  }
  const settings = await loadSettings(ctx.db);
  if (!settings.pricing.enabledDeliveryOptions.includes(input.deliveryOption)) throw new ServiceError("Choose delivery or pick-up.");
  if (input.areaId) {
    const [a] = await ctx.db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, input.areaId), eq(areas.active, true)));
    if (!a) throw new ServiceError("Choose your area from the list.");
  }
  if (input.deliveryOption !== "pickup" && (!input.address.trim() || !input.areaId)) throw new ServiceError("Enter your delivery address and area.");
  const leadSource = (LEAD_SOURCES as readonly string[]).includes(input.source ?? "") ? (input.source as (typeof LEAD_SOURCES)[number]) : "other";
  const suggestion = suggestNutrition({ sex: input.sex, age: Math.round(input.age), weightKg: input.weightKg, heightCm: Math.round(input.heightCm), activity: input.activity, goal: input.goal }, settings.nutrition);

  const created = await ctx.db.transaction(async (tx) => {
    const [taken] = await tx.select({ id: user.id }).from(user).where(eq(user.phoneNumber, phone));
    if (taken) throw new ServiceError(DUPLICATE_PHONE, "duplicate_phone");
    const [existing] = await tx.select().from(clients).where(eq(clients.phone, phone));
    if (existing && (existing.userId || existing.status !== "lead")) throw new ServiceError(DUPLICATE_PHONE, "duplicate_phone");
    if (existing) {
      // There is no phone verification, so a staff-entered lead is claimed only while no staff work hangs on it
      // (no plan, no consultation, no nutritionist-set profile). Otherwise the team finishes the account.
      const [hasPlan] = await tx.select({ id: subscriptions.id }).from(subscriptions).where(eq(subscriptions.clientId, existing.id)).limit(1);
      const [hasConsult] = await tx.select({ id: consultations.id }).from(consultations).where(eq(consultations.clientId, existing.id)).limit(1);
      const [setByStaff] = await tx.select({ id: nutritionProfiles.id }).from(nutritionProfiles)
        .where(and(eq(nutritionProfiles.clientId, existing.id), isNotNull(nutritionProfiles.setByUserId))).limit(1);
      if (hasPlan || hasConsult || setByStaff) throw new ServiceError(STAFF_LEAD_EXISTS, "lead_in_progress");
    }
    const u = await createClientUser(tx, { name: `${input.firstName.trim()} ${input.lastName.trim()}`, phone, password: input.password });
    const values = {
      userId: u.id, firstName: input.firstName.trim(), lastName: input.lastName.trim(), phone,
      sex: input.sex, age: Math.round(input.age), weightG: Math.round(input.weightKg * 1000), heightCm: Math.round(input.heightCm),
      activity: input.activity, goal: input.goal,
      // never drop an allergy or dislike staff already recorded: merge
      allergies: cleanList([...(existing?.allergies ?? []), ...input.allergies]), dislikes: cleanList([...(existing?.dislikes ?? []), ...input.dislikes]),
      address: input.address.trim() || null, areaId: input.areaId, landmark: input.landmark.trim() || null,
    };
    // A lead that staff entered (walk-in, phone) and that has no login yet is claimed by the sign-up (D392).
    const [client] = existing
      ? await tx.update(clients).set(values).where(and(eq(clients.id, existing.id), isNull(clients.userId))).returning()
      : await tx.insert(clients).values({ ...values, status: "lead", leadSource }).returning();
    const [current] = await tx.select({ id: nutritionProfiles.id }).from(nutritionProfiles)
      .where(and(eq(nutritionProfiles.clientId, client.id), eq(nutritionProfiles.isCurrent, true)));
    let size: string = suggestion.size;
    if (!current) {
      await tx.insert(nutritionProfiles).values({
        clientId: client.id, bmr: suggestion.bmr, tdee: suggestion.tdee,
        suggestedKcal: suggestion.targetKcal, suggestedSize: suggestion.size, suggestedProteinG: suggestion.proteinG, suggestedCarbG: suggestion.carbG, suggestedFatG: suggestion.fatG,
        kcalTarget: suggestion.sizeKcal, size: suggestion.size, goal: input.goal, proteinG: suggestion.proteinG, carbG: suggestion.carbG, fatG: suggestion.fatG,
        provisional: true, setByUserId: null, setAt: ctx.now, isCurrent: true,
      });
    } else {
      const [np] = await tx.select({ size: nutritionProfiles.size }).from(nutritionProfiles).where(eq(nutritionProfiles.id, current.id));
      size = np.size;
    }
    await writeAudit(tx, null, { action: existing ? "client.signup_claim_lead" : "client.signup", entity: "clients", entityId: client.id,
      after: { leadSource: existing?.leadSource ?? leadSource, size: suggestion.size, provisional: !current } });
    return { client, userId: u.id, size };
  });

  const result: SignUpResult = { clientId: created.client.id, userId: created.userId, phone, size: created.size, plan: { status: "none" } };
  if (!input.plan) return result;

  // The plan: priced from the formula; missing ingredient prices block it but keep the account (PLN-06).
  const [pkg] = await ctx.db.select().from(packages).where(eq(packages.id, input.plan.packageId));
  if (!pkg || !pkg.active) return { ...result, plan: { status: "failed", error: "Choose a package." } };
  const quote = await quotePrice(ctx.db, { profile: suggestion.profile, deliveryOption: input.deliveryOption, packageId: pkg.id }, addisDate(ctx.now));
  if (!quote.ok) return { ...result, plan: { status: "price_missing", missing: quote.missing } };
  const actor = await loadActor(ctx.db, created.userId);
  const isQs = input.plan.start === "quick_start";
  const qsPlan = isQs ? quickStartPlan(ctx.now, settings.schedule, await quickStartsTakenByDate(ctx.db, addisDate(ctx.now))) : null;
  try {
    const { subscription, invoice } = await createSubscription({ db: ctx.db, actor, now: ctx.now }, {
      clientId: created.client.id, packageId: pkg.id, deliveryOption: input.deliveryOption, billingPeriod: input.plan.billingPeriod,
      termMonths: 1, start: input.plan.start,
    }, { selfService: true });
    return { ...result, plan: { status: "created", startDate: subscription.startDate, amountBirr: invoice.amountBirr, dueAt: invoice.dueAt,
      quickStart: isQs, capacityShifted: qsPlan?.capacityShifted ?? false } };
  } catch (e) {
    if (e instanceof ServiceError) return { ...result, plan: { status: "failed", error: e.message } };
    throw e;
  }
}

/** Packages and areas for the sign-up form (anon may read packages). */
export async function signUpOptions(db: DbOrTx) {
  const [pkgs, areaRows, settings] = await Promise.all([
    db.select().from(packages).where(eq(packages.active, true)).orderBy(packages.sort),
    db.select({ id: areas.id, name: areas.name }).from(areas).where(eq(areas.active, true)).orderBy(areas.sort, areas.name),
    loadSettings(db),
  ]);
  return {
    packages: pkgs.map((p) => ({ id: p.id, code: p.code, name: p.name, swapLimit: p.swapLimit, checkinIntervalDays: p.checkinIntervalDays,
      coaching: p.coaching, deliveryOptions: p.deliveryOptions.filter((d) => settings.pricing.enabledDeliveryOptions.includes(d)) })),
    areas: areaRows,
    deliveryOptions: settings.pricing.enabledDeliveryOptions,
    quickStartCutoffTime: settings.schedule.quickStartCutoffTime,
  };
}

/**
 * Price preview for the sign-up and calculator screens: the plan price and the first invoice for a start choice.
 * Null amounts mean a price is missing (shown as "Prices are being updated").
 */
export async function previewQuote(db: DbOrTx, now: Date, q: { profile: Parameters<typeof quotePrice>[1]["profile"]; packageId: string; deliveryOption: DeliveryOption }) {
  const quote = await quotePrice(db, { profile: q.profile, deliveryOption: q.deliveryOption, packageId: q.packageId }, addisDate(now));
  if (!quote.ok) return { ok: false as const };
  const settings = await loadSettings(db);
  const qs = quickStartPlan(now, settings.schedule, await quickStartsTakenByDate(db, addisDate(now)));
  return {
    ok: true as const, planPrice: quote.planPrice, priceDay: quote.priceDayBirr,
    quickStart: qs ? { startDate: qs.startDate, serviceDays: qs.serviceDays, amount: quickStartAmount(quote.priceDay, qs.serviceDays, settings.pricing), lockAt: qs.lockAt, capacityShifted: qs.capacityShifted } : null,
  };
}
