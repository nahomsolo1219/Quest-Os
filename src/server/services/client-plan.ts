// Per-client inputs for orders and pricing: profile, standing swaps and add-ons in force for a week.
import { and, eq, inArray } from "drizzle-orm";
import { clientAddons, clientSwaps, clients, nutritionProfiles } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { profileOf } from "@/domain/nutrition";
import type { OrderClient } from "@/domain/orders";
import { swapActiveInWeek, type Addon } from "@/domain/swaps";
import type { DateStr, DeliveryOption, Goal, Profile } from "@/domain/types";

export type ClientPlanInput = Omit<OrderClient, "deliveryOption"> & { goal: Goal | null };

/** Builds OrderClient inputs for many clients for one week (swaps/add-ons that are in force that week). */
export async function loadClientPlanInputs(db: DbOrTx, clientIds: string[], weekStart: DateStr): Promise<Map<string, ClientPlanInput>> {
  const out = new Map<string, ClientPlanInput>();
  if (clientIds.length === 0) return out;
  const [cs, profiles, swaps, addons] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, clientIds)),
    db.select().from(nutritionProfiles).where(and(inArray(nutritionProfiles.clientId, clientIds), eq(nutritionProfiles.isCurrent, true))),
    db.select().from(clientSwaps).where(and(inArray(clientSwaps.clientId, clientIds), eq(clientSwaps.status, "approved"))),
    db.select().from(clientAddons).where(inArray(clientAddons.clientId, clientIds)),
  ]);
  for (const c of cs) {
    const np = profiles.find((p) => p.clientId === c.id);
    const goal: Goal = np?.goal ?? c.goal ?? "lean";
    const profile: Profile = profileOf(np?.size ?? "M", goal);
    out.set(c.id, {
      clientId: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      allergies: c.allergies,
      dislikes: c.dislikes,
      goal,
      profile,
      swapRuleIds: swaps.filter((s) => s.clientId === c.id && s.swapRuleId && swapActiveInWeek(s, weekStart)).map((s) => s.swapRuleId!),
      addons: addons.filter((a) => a.clientId === c.id && swapActiveInWeek(a, weekStart)).map((a): Addon => ({ kind: "extra_protein", slot: a.slot })),
    });
  }
  return out;
}

export function withDelivery(p: ClientPlanInput, deliveryOption: DeliveryOption): OrderClient {
  return { ...p, deliveryOption };
}
