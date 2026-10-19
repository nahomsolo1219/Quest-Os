"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { assignRider, reorderDrops } from "@/server/services/delivery";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date.");

const reorderSchema = z.object({ date, orderedIds: z.array(z.uuid()).min(1).max(500) });

export async function reorderDropsAction(input: z.input<typeof reorderSchema>) {
  const r = await runAction(reorderSchema, input, (ctx, d) => reorderDrops(ctx, d.date, d.orderedIds), "Route order saved");
  if (r.ok) { revalidatePath("/staff/delivery"); revalidatePath("/delivery"); }
  return r;
}

const assignSchema = z.object({ dropIds: z.array(z.uuid()).min(1, "Pick at least one drop.").max(500), riderUserId: z.uuid().nullable() });

export async function assignRiderAction(input: z.input<typeof assignSchema>) {
  const r = await runAction(assignSchema, input, (ctx, d) => assignRider(ctx, d.dropIds, d.riderUserId), "Rider saved");
  if (r.ok) { revalidatePath("/staff/delivery"); revalidatePath("/delivery"); }
  return r;
}
