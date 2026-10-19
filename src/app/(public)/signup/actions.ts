"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { previewQuote, signUp } from "@/server/services/signup";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { ACTIVITIES, BILLING_PERIODS, DELIVERY_OPTIONS, GOALS, PROFILES, SEXES } from "@/domain/types";

const signUpSchema = z.object({
  firstName: z.string().trim().min(1, "Enter your first name.").max(60),
  lastName: z.string().trim().min(1, "Enter your last name.").max(60),
  phone: z.string().refine((v) => normalizeEthiopianPhone(v) !== null, "Enter an Ethiopian mobile number, for example 0911 234 567."),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  sex: z.enum(SEXES),
  age: z.number().int().min(14).max(90),
  weightKg: z.number().min(30).max(250),
  heightCm: z.number().min(120).max(230),
  activity: z.enum(ACTIVITIES),
  goal: z.enum(GOALS),
  allergies: z.array(z.string().max(40)).max(20),
  dislikes: z.array(z.string().max(40)).max(20),
  address: z.string().max(300),
  areaId: z.uuid().nullable(),
  landmark: z.string().max(200),
  deliveryOption: z.enum(DELIVERY_OPTIONS),
  plan: z.object({ packageId: z.uuid(), billingPeriod: z.enum(BILLING_PERIODS), start: z.enum(["quick_start", "next_week"]) }).nullable(),
  source: z.string().max(30).nullable().optional(),
});

export async function signUpAction(input: unknown) {
  return runAction(signUpSchema, input, (ctx, data) => signUp(ctx, data));
}

export async function quoteAction(input: unknown) {
  return runAction(z.object({ profile: z.enum(PROFILES), packageId: z.uuid(), deliveryOption: z.enum(DELIVERY_OPTIONS) }), input,
    (ctx, q) => previewQuote(ctx.db, ctx.now, q));
}
