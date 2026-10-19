"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { confirmPayment, rejectPayment } from "@/server/services/billing";
import { S } from "./strings";

const confirmSchema = z.object({ paymentId: z.uuid() });
export async function confirmPaymentAction(input: z.input<typeof confirmSchema>) {
  return runAction(confirmSchema, input, (ctx, d) => confirmPayment(ctx, d.paymentId), S.confirmed);
}

const rejectSchema = z.object({ paymentId: z.uuid(), reason: z.string().trim().min(3, S.reasonRequired).max(300) });
export async function rejectPaymentAction(input: z.input<typeof rejectSchema>) {
  return runAction(rejectSchema, input, (ctx, d) => rejectPayment(ctx, d.paymentId, d.reason), S.rejected);
}
