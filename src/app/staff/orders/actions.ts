"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { lockWeekNow } from "@/server/services/ops";
import { S } from "./strings";

const schema = z.object({ weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export async function lockNowAction(input: z.input<typeof schema>) {
  const res = await runAction(schema, input, (ctx, d) => lockWeekNow(ctx, d.weekStart));
  if (res.ok) res.message = S.locked(res.data.locked, res.data.skippedUnpaid, res.data.paused);
  return res;
}
