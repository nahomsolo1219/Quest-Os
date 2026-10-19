"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import {
  addExtraProtein, connectTelegram, disconnectTelegram, endSwap, logWeight, pauseMyPlan, removeExtraProtein, requestSizeChange,
  requestSwap, updateMyProfile, uploadReceipt,
} from "@/server/services/client-app";
import { rateMeal } from "@/server/services/ratings";
import { markRead } from "@/server/services/notifications";
import { PAYMENT_METHODS, SLOTS } from "@/domain/types";

// Client actions: the client id is never taken from the browser; services use the signed-in actor's own record.
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

export async function rateMealAction(input: unknown) {
  return runAction(z.object({ mealId: z.uuid(), serviceDate: dateStr, rating: z.number().int().min(1, "Rate from 1 to 5.").max(5, "Rate from 1 to 5."),
    comment: z.string().max(500).optional() }), input, (ctx, d) => rateMeal(ctx, d).then(() => undefined), "Thanks for rating your meal.");
}

export async function requestSizeChangeAction(input: unknown) {
  return runAction(z.object({ note: z.string().trim().min(3, "Tell the nutritionist what you would like changed.").max(500) }), input,
    (ctx, d) => requestSizeChange(ctx, d.note).then(() => undefined), "Request sent. The nutritionist will get back to you.");
}

export async function requestSwapAction(input: unknown) {
  return runAction(z.object({ swapRuleId: z.uuid().optional(), customRequest: z.string().max(300).optional() }), input, async (ctx, d) => {
    const row = await requestSwap(ctx, d);
    return { status: row.status, effectiveWeekStart: row.effectiveWeekStart };
  });
}

export async function endSwapAction(input: unknown) {
  return runAction(z.object({ id: z.uuid() }), input, (ctx, d) => endSwap(ctx, d.id));
}

export async function addExtraProteinAction(input: unknown) {
  return runAction(z.object({ slot: z.enum(SLOTS) }), input, async (ctx, d) => {
    const row = await addExtraProtein(ctx, d.slot);
    return { effectiveWeekStart: row.effectiveWeekStart };
  });
}

export async function removeExtraProteinAction(input: unknown) {
  return runAction(z.object({ id: z.uuid() }), input, (ctx, d) => removeExtraProtein(ctx, d.id));
}

export async function pauseAction(input: unknown) {
  return runAction(z.object({ startWeek: dateStr, weeks: z.number().int().min(1, "Pause at least one week.").max(8, "Pause up to 8 weeks at a time.") }), input,
    (ctx, d) => pauseMyPlan(ctx, d));
}

export async function uploadReceiptAction(formData: FormData) {
  const receipt = formData.get("receipt");
  const input = {
    invoiceId: formData.get("invoiceId"), method: formData.get("method"), reference: String(formData.get("reference") ?? ""),
    receipt: receipt instanceof File && receipt.size > 0 ? receipt : null,
  };
  return runAction(z.object({ invoiceId: z.uuid(), method: z.enum(PAYMENT_METHODS, "Choose how you paid."), reference: z.string().max(100),
    receipt: z.instanceof(File).nullable() }), input,
  (ctx, d) => uploadReceipt(ctx, d).then(() => undefined), "Receipt sent. Operations will confirm it soon.");
}

export async function logWeightAction(input: unknown) {
  return runAction(z.object({ weightKg: z.number("Enter your weight in kg.").min(30, "Enter your weight in kg (30–250).").max(250, "Enter your weight in kg (30–250)."), date: dateStr.optional() }), input,
    (ctx, d) => logWeight(ctx, d).then(() => undefined), "Weight saved.");
}

export async function updateProfileAction(input: unknown) {
  return runAction(z.object({ address: z.string().max(300), areaId: z.uuid().nullable(), landmark: z.string().max(200), telegramOptIn: z.boolean() }), input,
    (ctx, d) => updateMyProfile(ctx, d));
}

export async function connectTelegramAction() {
  return runAction(z.object({}), {}, (ctx) => connectTelegram(ctx));
}

export async function disconnectTelegramAction() {
  return runAction(z.object({}), {}, (ctx) => disconnectTelegram(ctx), "Telegram disconnected.");
}

export async function markReadAction(input: unknown) {
  return runAction(z.object({ ids: z.union([z.array(z.uuid()), z.literal("all")]) }), input, (ctx, d) => markRead(ctx, d.ids), "Marked as read.");
}
