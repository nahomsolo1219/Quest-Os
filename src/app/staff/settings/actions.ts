"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { updateSettings } from "@/server/services/settings";
import {
  COST_MODES, createArea, createSwapRule, moveArea, QTY_MODES, setIngredientNutrition, setIngredientPrice, updateArea, updatePackage, updateSwapRule,
} from "@/server/services/catalog";
import { nutritionSettingsSchema, pricingSettingsSchema, scheduleSettingsSchema } from "@/domain/settings";
import { DELIVERY_OPTIONS } from "@/domain/types";
import { S } from "./strings";

const reason = z.string().max(500).optional();
const done = () => revalidatePath("/staff/settings", "layout");

export async function savePricingAction(value: unknown, why?: string) {
  const r = await runAction(z.object({ value: pricingSettingsSchema, reason }), { value, reason: why }, (ctx, d) => updateSettings(ctx, "pricing", d.value, d.reason || undefined), S.saved);
  done();
  return r;
}

export async function saveNutritionSettingsAction(value: unknown, why?: string) {
  const schema = z.object({ value: nutritionSettingsSchema.refine((v) => Object.values(v.macroSplit).every((s) => Math.abs(s.protein + s.carb + s.fat - 1) <= 0.001), "Each macro split must add up to 100%.")
    .refine((v) => v.factorMin < v.factorMax, "The smallest scale factor must be below the largest."), reason });
  const r = await runAction(schema, { value, reason: why }, (ctx, d) => updateSettings(ctx, "nutrition", d.value, d.reason || undefined), S.saved);
  done();
  return r;
}

export async function saveScheduleAction(value: unknown, why?: string) {
  const r = await runAction(z.object({ value: scheduleSettingsSchema, reason }), { value, reason: why }, (ctx, d) => updateSettings(ctx, "schedule", d.value, d.reason || undefined), S.saved);
  done();
  return r;
}

const packageSchema = z.object({
  id: z.uuid(), name: z.string().trim().min(1, "Give the package a name.").max(60),
  swapLimit: z.number().int("Swap limit: whole numbers only.").min(0).max(30, "Swap limit is at most 30."),
  checkinIntervalDays: z.number().int().min(1, "Check-in interval is 1 to 90 days.").max(90, "Check-in interval is 1 to 90 days."),
  coaching: z.string().max(300), deliveryOptions: z.array(z.enum(DELIVERY_OPTIONS)).min(1, "Pick at least one delivery option."),
  serviceFeeMonthBirr: z.number().int("Service fee: whole birr.").min(0, "Service fee cannot be negative."), prioritySlot: z.boolean(), active: z.boolean(),
});
export async function updatePackageAction(input: z.infer<typeof packageSchema>) {
  const r = await runAction(packageSchema, input, async (ctx, d) => { await updatePackage(ctx, d); }, S.packageSaved);
  done();
  return r;
}

const qty = z.number().positive("Quantity must be above 0.").max(1000).nullable();
const ruleSchema = z.object({ id: z.uuid(), label: z.string().trim().min(1, "Give the swap a label.").max(120), active: z.boolean(), qtyMode: z.enum(QTY_MODES), qtyValue: qty, costMode: z.enum(COST_MODES) });
export async function updateSwapRuleAction(input: z.infer<typeof ruleSchema>) {
  const r = await runAction(ruleSchema, input, async (ctx, d) => { await updateSwapRule(ctx, d); }, S.ruleSaved);
  done();
  return r;
}

const newRuleSchema = z.object({
  label: z.string().trim().min(1, "Give the swap a label.").max(120), fromIngredientId: z.uuid("Pick the ingredient to swap from."),
  fromMealCode: z.string().optional(), toIngredientId: z.uuid("Pick the ingredient to swap to."), qtyMode: z.enum(QTY_MODES), qtyValue: qty, costMode: z.enum(COST_MODES),
});
export async function createSwapRuleAction(input: z.infer<typeof newRuleSchema>) {
  const r = await runAction(newRuleSchema, input, async (ctx, d) => {
    await createSwapRule(ctx, { label: d.label, fromIngredientIds: [d.fromIngredientId], fromMealCodes: d.fromMealCode ? [d.fromMealCode] : null,
      toIngredientId: d.toIngredientId, qtyMode: d.qtyMode, qtyValue: d.qtyValue, costMode: d.costMode });
  }, S.ruleCreated);
  done();
  return r;
}

const areaName = z.string().trim().min(2, "Area name must be at least 2 letters.").max(60);
export async function createAreaAction(input: { name: string }) {
  const r = await runAction(z.object({ name: areaName }), input, async (ctx, d) => { await createArea(ctx, d); }, S.areaAdded);
  done();
  return r;
}
export async function updateAreaAction(input: { id: string; name: string; active: boolean }) {
  const r = await runAction(z.object({ id: z.uuid(), name: areaName, active: z.boolean() }), input, async (ctx, d) => { await updateArea(ctx, d); }, S.areaSaved);
  done();
  return r;
}
export async function moveAreaAction(input: { id: string; direction: "up" | "down" }) {
  const r = await runAction(z.object({ id: z.uuid(), direction: z.enum(["up", "down"]) }), input, async (ctx, d) => { await moveArea(ctx, d); }, S.areaMoved);
  done();
  return r;
}

const priceSchema = z.object({
  id: z.uuid(), costPerUnitBirr: z.number().int("Price: whole birr only.").positive("Price must be above 0.").max(1_000_000).nullable(),
  supplier: z.string().max(120).nullable().optional(),
});
export async function setPriceAction(input: z.infer<typeof priceSchema>) {
  const r = await runAction(priceSchema, input, async (ctx, d) => { await setIngredientPrice(ctx, d); }, S.priceSaved);
  done();
  return r;
}

const macro = (l: string) => z.number({ error: `${l}: enter a number.` }).min(0, `${l} cannot be negative.`).max(1000, `${l} is too high.`);
const nutSchema = z.object({ id: z.uuid(), kcal: macro("kcal"), proteinG: macro("Protein"), carbG: macro("Carbs"), fatG: macro("Fat") });
export async function setIngredientNutritionAction(input: z.infer<typeof nutSchema>) {
  const r = await runAction(nutSchema, input, async (ctx, d) => { await setIngredientNutrition(ctx, d); }, S.nutritionSaved);
  done();
  return r;
}

