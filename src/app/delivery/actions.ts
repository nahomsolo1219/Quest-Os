"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import { markDelivered, markFailed, undoDropStatus } from "@/server/services/delivery";

function refresh() {
  revalidatePath("/delivery");
  revalidatePath("/delivery/pickup");
  revalidatePath("/staff/delivery");
}

const idSchema = z.object({ dropId: z.uuid() });

export async function markDeliveredAction(input: z.input<typeof idSchema>) {
  const r = await runAction(idSchema, input, async (ctx, d) => { await markDelivered(ctx, d.dropId); return null; }, "Marked delivered");
  if (r.ok) refresh();
  return r;
}

export async function markHandedOverAction(input: z.input<typeof idSchema>) {
  const r = await runAction(idSchema, input, async (ctx, d) => { await markDelivered(ctx, d.dropId); return null; }, "Handed over");
  if (r.ok) refresh();
  return r;
}

const failSchema = z.object({ dropId: z.uuid(), reason: z.string().trim().min(1, "Pick or write a reason the drop failed.").max(300) });

export async function markFailedAction(input: z.input<typeof failSchema>) {
  const r = await runAction(failSchema, input, async (ctx, d) => { await markFailed(ctx, d.dropId, d.reason); return null; }, "Marked failed. Operations have been told.");
  if (r.ok) refresh();
  return r;
}

const undoSchema = z.object({ dropId: z.uuid(), expected: z.enum(["delivered", "failed"]), release: z.boolean().default(false) });

export async function undoDropAction(input: z.input<typeof undoSchema>) {
  const r = await runAction(undoSchema, input, async (ctx, d) => { await undoDropStatus(ctx, d.dropId, d.expected, d.release); return null; }, "Undone. The drop is pending again.");
  if (r.ok) refresh();
  return r;
}
