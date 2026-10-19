"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { packages } from "@db/schema";
import { runAction } from "@/server/actions";
import { quotePrice } from "@/server/services/pricing";
import { addisDate } from "@/domain/time";
import { PROFILES } from "@/domain/types";

/**
 * Indicative price for the public calculator (PLN-11): Essential, daily delivery, at the suggested profile.
 * Returns null when any needed ingredient price is missing, so no number is shown.
 */
export async function indicativePriceAction(input: unknown) {
  return runAction(z.object({ profile: z.enum(PROFILES) }), input, async (ctx, { profile }) => {
    const [pkg] = await ctx.db.select({ id: packages.id }).from(packages).where(eq(packages.code, "essential"));
    if (!pkg) return null;
    const q = await quotePrice(ctx.db, { profile, deliveryOption: "daily", packageId: pkg.id }, addisDate(ctx.now));
    return q.ok ? { planPrice: q.planPrice } : null;
  });
}
