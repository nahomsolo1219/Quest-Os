"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { decideSwap, logCheckin, recordConsultation, setNutrition } from "@/server/services/nutrition";
import { recomputePortions, setPortionCell } from "@/server/services/portions";
import { addisInstant } from "@/domain/time";
import { PROFILES, SIZES, GOALS } from "@/domain/types";
import { S } from "./strings";

const uuid = z.uuid("Pick a client.");
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date.");
const int = (label: string, max: number) => z.number({ error: `${label}: enter a number.` }).int(`${label}: whole numbers only.`).min(1, `${label} must be above 0.`).max(max, `${label} is too high.`);

const nutritionSchema = z.object({
  clientId: uuid, size: z.enum(SIZES), goal: z.enum(GOALS), kcalTarget: int("Calories", 6000), proteinG: int("Protein", 600),
  carbG: int("Carbs", 900), fatG: int("Fat", 400), note: z.string().max(500).optional(),
});
export async function setNutritionAction(input: z.infer<typeof nutritionSchema>) {
  const r = await runAction(nutritionSchema, input, (ctx, d) => setNutrition(ctx, d), S.saved);
  revalidatePath("/staff/nutrition", "layout");
  return r.ok ? { ...r, data: { isOverride: r.data.isOverride, effectiveWeek: r.data.effectiveWeek } } : r;
}

const consultSchema = z.object({ clientId: uuid, heldAt: z.string().min(1, "Enter when it was held."), mode: z.enum(["in_person", "phone"]), notes: z.string().max(2000).optional() });
export async function recordConsultationAction(input: z.infer<typeof consultSchema>) {
  const r = await runAction(consultSchema, input, async (ctx, d) => {
    // heldAt arrives as an Addis wall time "YYYY-MM-DDTHH:mm"
    const [date, time] = d.heldAt.split("T");
    await recordConsultation(ctx, { clientId: d.clientId, heldAt: addisInstant(date, time.slice(0, 5)), mode: d.mode, notes: d.notes });
  }, S.consultSaved);
  revalidatePath(`/staff/nutrition/clients/${input.clientId}`);
  return r;
}

const checkinSchema = z.object({
  clientId: uuid, date: dateStr, weightKg: z.number().min(25, "Weight must be at least 25 kg.").max(300, "Weight must be under 300 kg.").nullable(),
  adherencePct: z.number().int().min(0, "Adherence is 0 to 100%.").max(100, "Adherence is 0 to 100%.").nullable(), notes: z.string().max(2000).optional(),
});
export async function logCheckinAction(input: z.infer<typeof checkinSchema>) {
  const r = await runAction(checkinSchema, input, async (ctx, d) => {
    await logCheckin(ctx, { clientId: d.clientId, date: d.date, weightG: d.weightKg == null ? null : Math.round(d.weightKg * 1000), adherencePct: d.adherencePct, notes: d.notes });
  }, S.checkinSaved);
  revalidatePath("/staff/nutrition", "layout");
  return r;
}

const decideSchema = z.object({ id: z.uuid(), approve: z.boolean(), note: z.string().max(500).optional(), swapRuleId: z.uuid().nullable().optional() });
export async function decideSwapAction(input: z.infer<typeof decideSchema>) {
  const r = await runAction(decideSchema, input, async (ctx, d) => { await decideSwap(ctx, d); }, input.approve ? S.swapApproved : S.swapRejected);
  revalidatePath("/staff/nutrition", "layout");
  return r;
}

const cellSchema = z.object({ partId: z.uuid(), profile: z.enum(PROFILES), qty: z.number().int("Whole grams or pieces only.").min(0).max(2000, "At most 2000.").nullable() });
export async function setPortionCellAction(input: z.infer<typeof cellSchema>) {
  const r = await runAction(cellSchema, input, (ctx, d) => setPortionCell(ctx, d), input.qty === null ? S.cellCleared : S.cellSaved);
  revalidatePath("/staff/nutrition/profiles");
  return r;
}

export async function recomputeAction() {
  const r = await runAction(z.object({}), {}, async (ctx) => {
    const res = await recomputePortions(ctx);
    return { flagged: res.filter((x) => x.flagged).length };
  });
  revalidatePath("/staff/nutrition", "layout");
  return r.ok ? { ...r, message: S.recomputed(r.data.flagged) } : r;
}
