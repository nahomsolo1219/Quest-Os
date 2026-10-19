// Meal ratings (COM-08, SPEC doc 7 point 6): a client rates each meal they received 1–5 with an optional comment.
// Private by default: only the client and staff with mealRatings.read see them; they feed the owners' dashboard.
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { deliveryDrops, mealRatings, orderDays, orderMeals, weeklyOrders } from "@db/schema";
import { assertCan, ForbiddenError } from "@/server/authz";
import { addisDate, isDateStr } from "@/domain/time";
import type { DateStr } from "@/domain/types";
import { ServiceError, type Ctx } from "./context";

export type RateMealInput = { mealId: string; serviceDate: DateStr; rating: number; comment?: string | null };

function ownClientId(ctx: Ctx): string {
  assertCan(ctx.actor, "mealRatings.writeOwn");
  if (!ctx.actor.clientId) throw new ForbiddenError("Only clients rate meals.");
  return ctx.actor.clientId;
}

/** One rating per client, meal and service date; rating again the same day updates it. Only meals actually received. */
export async function rateMeal(ctx: Ctx, input: RateMealInput) {
  const clientId = ownClientId(ctx);
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) throw new ServiceError("Rate from 1 to 5.");
  if (!isDateStr(input.serviceDate)) throw new ServiceError("That date is not valid.");
  if (input.serviceDate > addisDate(ctx.now)) throw new ServiceError("You can rate a meal once you have it.");
  const comment = input.comment?.trim().slice(0, 500) || null;
  const [received] = await ctx.db.select({ id: orderMeals.id }).from(orderMeals)
    .innerJoin(orderDays, eq(orderDays.id, orderMeals.orderDayId))
    .innerJoin(weeklyOrders, eq(weeklyOrders.id, orderDays.weeklyOrderId))
    .where(and(eq(orderMeals.clientId, clientId), eq(orderMeals.mealId, input.mealId), eq(orderDays.serviceDate, input.serviceDate), eq(weeklyOrders.status, "locked")))
    .limit(1);
  if (!received) throw new ServiceError("You can only rate meals you received.");
  // a failed drop means the meal never arrived
  const [failed] = await ctx.db.select({ id: deliveryDrops.id }).from(deliveryDrops)
    .where(and(eq(deliveryDrops.clientId, clientId), eq(deliveryDrops.status, "failed"), sql`${input.serviceDate}::date = any(${deliveryDrops.serviceDates})`)).limit(1);
  if (failed) throw new ServiceError("This delivery did not reach you, so there is nothing to rate. Operations will be in touch.");
  const [row] = await ctx.db.insert(mealRatings).values({ clientId, mealId: input.mealId, serviceDate: input.serviceDate, rating: input.rating, comment })
    .onConflictDoUpdate({ target: [mealRatings.clientId, mealRatings.mealId, mealRatings.serviceDate], set: { rating: input.rating, comment, updatedAt: ctx.now } })
    .returning();
  return row;
}

/** The client's own ratings for some service dates (for the today screen). */
export async function myRatings(ctx: Ctx, from: DateStr, to: DateStr) {
  assertCan(ctx.actor, "mealRatings.writeOwn");
  if (!ctx.actor.clientId) return [];
  return ctx.db.select().from(mealRatings)
    .where(and(eq(mealRatings.clientId, ctx.actor.clientId), gte(mealRatings.serviceDate, from), lte(mealRatings.serviceDate, to)));
}

/** Ratings for the owners' dashboard (mealRatings.read): raw rows from a date, to feed `mealRatingAverages`. */
export async function ratingsSince(ctx: Ctx, from: DateStr, mealIds?: string[]) {
  assertCan(ctx.actor, "mealRatings.read");
  const where = mealIds?.length ? and(gte(mealRatings.serviceDate, from), inArray(mealRatings.mealId, mealIds)) : gte(mealRatings.serviceDate, from);
  return ctx.db.select({ mealId: mealRatings.mealId, serviceDate: mealRatings.serviceDate, rating: mealRatings.rating, comment: mealRatings.comment })
    .from(mealRatings).where(where);
}
