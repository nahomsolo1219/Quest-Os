// Guided tour progress (staff-tour milestone): each staff member reads and writes only their own rows.
import { and, eq } from "drizzle-orm";
import { tourProgress } from "@db/schema";
import { assertSignedIn, isStaff, ForbiddenError } from "@/server/authz";
import { isTourId, toursFor, type TourId, type TourProgressMap, type TourStatus } from "@/lib/tours";
import { ServiceError, type Ctx } from "./context";

export async function myTourProgress(ctx: Ctx): Promise<TourProgressMap> {
  if (!ctx.actor || !isStaff(ctx.actor)) return {};
  const rows = await ctx.db.select().from(tourProgress).where(eq(tourProgress.userId, ctx.actor.userId));
  const out: TourProgressMap = {};
  for (const r of rows) if (isTourId(r.tourId)) out[r.tourId] = { step: r.step, status: r.status as TourStatus };
  return out;
}

/** Saves the step reached (or completed / skipped) for one of the actor's own tours. */
export async function saveTourProgress(ctx: Ctx, input: { tourId: string; step: number; status: TourStatus }) {
  assertSignedIn(ctx.actor);
  if (!isStaff(ctx.actor)) throw new ForbiddenError("Tours are for staff.");
  if (!isTourId(input.tourId) || !toursFor(ctx.actor.roles).includes(input.tourId as TourId)) {
    throw new ServiceError("That tour is not for your role.");
  }
  const userId = ctx.actor.userId;
  const values = { userId, tourId: input.tourId, step: Math.max(0, Math.floor(input.step)), status: input.status, updatedAt: ctx.now };
  await ctx.db.insert(tourProgress).values(values)
    .onConflictDoUpdate({ target: [tourProgress.userId, tourProgress.tourId], set: { step: values.step, status: values.status, updatedAt: ctx.now } });
  const [row] = await ctx.db.select().from(tourProgress).where(and(eq(tourProgress.userId, userId), eq(tourProgress.tourId, input.tourId)));
  return row;
}
