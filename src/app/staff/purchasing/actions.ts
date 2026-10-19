"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { logPurchase } from "@/server/services/inventory";
import { S } from "./strings";

const schema = z.object({
  ingredientId: z.uuid("Pick an ingredient."),
  qty: z.number({ error: "Enter the quantity bought." }).positive("Enter the quantity bought.").max(100000),
  totalPriceBirr: z.number({ error: "Enter the total price." }).int("Enter the total price in whole birr.").positive("Enter the total price.").max(10_000_000),
  supplier: z.string().trim().max(120).optional(),
  purchasedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the purchase date."),
});

export async function logPurchaseAction(input: z.input<typeof schema>) {
  const r = await runAction(schema, input, async (ctx, d) => {
    const res = await logPurchase(ctx, d);
    return { ingredientName: res.ingredientName, unitCostBirr: res.unitCostBirr, unit: res.unit };
  }, S.saved);
  if (r.ok) revalidatePath("/staff/purchasing");
  return r;
}
