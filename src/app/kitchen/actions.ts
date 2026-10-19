"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { logWaste, recordStockCount } from "@/server/services/inventory";
import { S } from "./strings";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

const countSchema = z.object({
  ingredientId: z.uuid(),
  countDate: date,
  qty: z.number().min(0, "Enter 0 or more.").max(100000).optional(),
  matchesExpected: z.boolean().optional(),
}).refine((v) => v.matchesExpected || v.qty != null, "Enter the amount counted.");

export async function saveStockCountAction(input: z.input<typeof countSchema>) {
  const r = await runAction(countSchema, input, (ctx, d) => recordStockCount(ctx, d), S.stockSaved);
  if (r.ok) revalidatePath("/kitchen/stock");
  return r;
}

const wasteSchema = z.object({
  ingredientId: z.uuid("Pick an ingredient."),
  qty: z.number({ error: "Enter the amount wasted." }).positive("Enter the amount wasted (above zero).").max(100000),
  reason: z.string().trim().min(1, "Say why it was wasted.").max(200),
  date,
});

export async function logWasteAction(input: z.input<typeof wasteSchema>) {
  const r = await runAction(wasteSchema, input, (ctx, d) => logWaste(ctx, d), S.wasteSaved);
  if (r.ok) revalidatePath("/kitchen/waste");
  return r;
}
