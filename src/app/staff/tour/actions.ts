"use server";

import { z } from "zod";
import { runAction } from "@/server/actions";
import { saveTourProgress } from "@/server/services/tour";
import { TOUR_IDS } from "@/lib/tours";

const schema = z.object({
  tourId: z.enum(TOUR_IDS),
  step: z.number().int().min(0).max(100),
  status: z.enum(["started", "completed", "skipped"]),
});

/** Called by the tour as the user moves through it; quiet (no toast) on the client. */
export async function saveTourProgressAction(input: z.input<typeof schema>) {
  return runAction(schema, input, async (ctx, d) => { await saveTourProgress(ctx, d); return null; }, "Saved");
}
