"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { markRead } from "@/server/services/notifications";
import { S } from "./strings";

const schema = z.object({ ids: z.union([z.literal("all"), z.array(z.uuid()).min(1).max(200)]) });
export async function markReadAction(input: z.input<typeof schema>) {
  return runAction(schema, input, (ctx, d) => markRead(ctx, d.ids), input.ids === "all" ? S.allMarked : S.marked);
}
