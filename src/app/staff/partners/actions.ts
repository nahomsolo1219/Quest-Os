"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { addContribution, deleteContribution } from "@/server/services/partners";
import { CONTRIBUTION_TYPES } from "@/domain/types";
import { S } from "./strings";

const schema = z.object({
  partnerUserId: z.uuid("Pick a partner."), contributedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date."), type: z.enum(CONTRIBUTION_TYPES),
  amountBirr: z.number().int("Amount: whole birr only.").positive("Amount must be above 0.").nullable(),
  hours: z.number().positive("Hours must be above 0.").max(1000).nullable(), note: z.string().max(500).optional(),
});
export async function addContributionAction(input: z.infer<typeof schema>) {
  const r = await runAction(schema, input, async (ctx, d) => { await addContribution(ctx, d); }, S.added);
  revalidatePath("/staff/partners");
  return r;
}

export async function deleteContributionAction(input: { id: string }) {
  const r = await runAction(z.object({ id: z.uuid() }), input, async (ctx, d) => { await deleteContribution(ctx, d); }, S.deleted);
  revalidatePath("/staff/partners");
  return r;
}
