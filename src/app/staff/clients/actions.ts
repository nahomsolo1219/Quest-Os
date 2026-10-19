"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { formatBirr } from "@/domain/money";
import { formatDate } from "@/domain/time";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { ACTIVITIES, BILLING_PERIODS, DELIVERY_OPTIONS, GOALS, LEAD_SOURCES, SEXES } from "@/domain/types";
import {
  createClientAccount, createLead, ensureProvisionalProfile, resetClientPassword, updateClient,
} from "@/server/services/clients";
import { onboardingQuote, recordCashPayment } from "@/server/services/ops";
import { applyDiscount, createSubscription, pausePlan, renewPlan, repricePlan } from "@/server/services/subscriptions";
import { S, W } from "./strings";

const uuid = z.uuid("Something is missing. Reload the page.");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

const leadSchema = z.object({
  firstName: z.string().trim().min(1, "Enter the first name.").max(60),
  lastName: z.string().trim().min(1, "Enter the last name.").max(60),
  phone: z.string().refine((v) => normalizeEthiopianPhone(v) !== null, S.invalidPhone),
  source: z.enum(LEAD_SOURCES, "Choose where they heard about us."),
  notes: z.string().max(2000).optional(),
});
export async function createLeadAction(input: z.input<typeof leadSchema>) {
  return runAction(leadSchema, input, (ctx, d) => createLead(ctx, d).then((c) => ({ id: c.id })), S.leadSaved);
}

const list = z.array(z.string().trim().max(60)).max(30);
const nullableInt = (min: number, max: number, msg: string) => z.number().int(msg).min(min, msg).max(max, msg).nullable().optional();
const updateSchema = z.object({
  clientId: uuid,
  fields: z.object({
    firstName: z.string().max(60).optional(),
    lastName: z.string().max(60).optional(),
    address: z.string().max(300).nullable().optional(),
    areaId: z.uuid().nullable().optional(),
    landmark: z.string().max(200).nullable().optional(),
    notes: z.string().max(4000).nullable().optional(),
    allergies: list.optional(),
    dislikes: list.optional(),
    sex: z.enum(SEXES).nullable().optional(),
    age: nullableInt(12, 100, "Age must be 12 to 100 years."),
    weightG: nullableInt(30000, 300000, "Weight must be 30 to 300 kg."),
    heightCm: nullableInt(120, 230, "Height must be 120 to 230 cm."),
    activity: z.enum(ACTIVITIES).nullable().optional(),
    goal: z.enum(GOALS).nullable().optional(),
    checkInWeekday: nullableInt(1, 7, "Choose a check-in day."),
  }),
});
export async function updateClientAction(input: z.input<typeof updateSchema>) {
  const res = await runAction(updateSchema, input, (ctx, d) => updateClient(ctx, d.clientId, d.fields));
  if (res.ok) res.message = res.data.effectiveWeek ? S.effectiveFrom(formatDate(res.data.effectiveWeek, "long")) : S.saved;
  return res;
}

const passwordSchema = z.object({ clientId: uuid, password: z.string().min(8, "Password must be at least 8 characters.").max(128) });
export async function createAccountAction(input: z.input<typeof passwordSchema>) {
  return runAction(passwordSchema, input, (ctx, d) => createClientAccount(ctx, d.clientId, d.password), S.accountCreated);
}
export async function resetPasswordAction(input: z.input<typeof passwordSchema>) {
  return runAction(passwordSchema, input, (ctx, d) => resetClientPassword(ctx, d.clientId, d.password), S.passwordReset);
}

const discountSchema = z.object({
  subscriptionId: uuid,
  discountMonthBirr: z.number().int("Whole birr only.").min(0, "Discount is 0 or more."),
  reason: z.string().trim().min(1, "Give a reason for the discount.").max(300),
});
export async function discountAction(input: z.input<typeof discountSchema>) {
  return runAction(discountSchema, input, (ctx, d) => applyDiscount(ctx, d), S.discountSaved);
}

const pauseSchema = z.object({ clientId: uuid, startWeek: dateStr, weeks: z.number().int().min(1, "Pause at least 1 week.").max(12, "Pause at most 12 weeks.") });
export async function pauseAction(input: z.input<typeof pauseSchema>) {
  const res = await runAction(pauseSchema, input, (ctx, d) => pausePlan(ctx, d));
  if (res.ok) res.message = S.paused(formatDate(res.data.endDate, "long"));
  return res;
}

const clientOnly = z.object({ clientId: uuid });
export async function renewAction(input: z.input<typeof clientOnly>) {
  const res = await runAction(clientOnly, input, (ctx, d) => renewPlan(ctx, d.clientId));
  if (res.ok) res.message = S.renewed(formatDate(res.data.endDate, "long"));
  return res;
}

const repriceSchema = z.object({ subscriptionId: uuid, reason: z.string().max(300).optional() });
export async function repriceAction(input: z.input<typeof repriceSchema>) {
  const res = await runAction(repriceSchema, input, (ctx, d) => repricePlan(ctx, d));
  if (res.ok) res.message = S.repriced(formatBirr(res.data.planPriceBirr));
  return res;
}

const cashSchema = z.object({ invoiceId: uuid, reference: z.string().max(100).optional() });
export async function cashPaymentAction(input: z.input<typeof cashSchema>) {
  return runAction(cashSchema, input, (ctx, d) => recordCashPayment(ctx, d), S.cashRecorded);
}

export async function provisionalProfileAction(input: z.input<typeof clientOnly>) {
  return runAction(clientOnly, input, (ctx, d) => ensureProvisionalProfile(ctx, d.clientId).then((r) => ({ created: r.created })), W.provisionalSaved);
}

const quoteSchema = z.object({ clientId: uuid, packageId: uuid, deliveryOption: z.enum(DELIVERY_OPTIONS), quickStart: z.boolean() });
export async function quoteAction(input: z.input<typeof quoteSchema>) {
  return runAction(quoteSchema, input, (ctx, d) => onboardingQuote(ctx, d));
}

const planSchema = z.object({
  clientId: uuid,
  packageId: uuid,
  deliveryOption: z.enum(DELIVERY_OPTIONS, "Choose delivery or pick-up."),
  billingPeriod: z.enum(BILLING_PERIODS, "Choose weekly or monthly billing."),
  termMonths: z.number().int().min(1, "Plan term is 1 to 4 months.").max(4, "Plan term is 1 to 4 months."),
  start: z.enum(["quick_start", "next_week"]),
});
export async function createPlanAction(input: z.input<typeof planSchema>) {
  return runAction(planSchema, input, (ctx, d) => createSubscription(ctx, d).then((r) => ({ subscriptionId: r.subscription.id, invoiceId: r.invoice.id })), W.planCreated);
}
