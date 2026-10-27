import "server-only";
import { addDays, addisDate } from "@/domain/time";
import type { Actor } from "@/server/authz";
import { isStaff } from "@/server/authz";
import { toursFor } from "@/lib/tours";
import { myTourProgress } from "@/server/services/tour";
import type { Ctx } from "@/server/services/context";
import type { TourBoot } from "@/components/tour/boot";

/** Tour data for the shells (staff areas, and the client shell for coaches); null for clients. */
export async function tourBoot(ctx: Ctx & { actor: Actor }): Promise<TourBoot | null> {
  if (!isStaff(ctx.actor)) return null;
  const today = addisDate(ctx.now);
  return { tours: toursFor(ctx.actor.roles), progress: await myTourProgress(ctx), ctx: { today, tomorrow: addDays(today, 1) } };
}
