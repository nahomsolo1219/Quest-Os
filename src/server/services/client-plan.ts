// Per-client inputs for orders and pricing: profile, standing swaps and add-ons in force for a week.
import { and, desc, eq, inArray } from "drizzle-orm";
import { clientAddons, clientSwaps, clients, nutritionProfiles } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { profileOf } from "@/domain/nutrition";
import type { OrderClient } from "@/domain/orders";
import { swapActiveInWeek, type Addon } from "@/domain/swaps";
import type { DateStr, DeliveryOption, Goal, Profile } from "@/domain/types";

export type ClientPlanInput = Omit<OrderClient, "deliveryOption"> & {
  goal: Goal | null;
  /** approved custom swaps (no swap-table rule): the kitchen applies them by hand from the packing list and labels */
  kitchenNotes: string[];
};

/** Builds OrderClient inputs for many clients for one week (swaps/add-ons that are in force that week). */
export async function loadClientPlanInputs(db: DbOrTx, clientIds: string[], weekStart: DateStr, asOf?: Date): Promise<Map<string, ClientPlanInput>> {
  const out = new Map<string, ClientPlanInput>();
  if (clientIds.length === 0) return out;
  const [cs, profiles, swaps, addons] = await Promise.all([
    db.select().from(clients).where(inArray(clients.id, clientIds)),
    asOf
      ? db.select().from(nutritionProfiles).where(inArray(nutritionProfiles.clientId, clientIds)).orderBy(desc(nutritionProfiles.setAt))
      : db.select().from(nutritionProfiles).where(and(inArray(nutritionProfiles.clientId, clientIds), eq(nutritionProfiles.isCurrent, true))),
    db.select().from(clientSwaps).where(and(inArray(clientSwaps.clientId, clientIds), eq(clientSwaps.status, "approved"))),
    db.select().from(clientAddons).where(inArray(clientAddons.clientId, clientIds)),
  ]);
  for (const c of cs) {
    // A lock run late uses the size and goal that were in force at its cutoff (business rule 2): a target set after
    // the cutoff starts the week after. Without asOf, the current profile.
    const mine = profiles.filter((p) => p.clientId === c.id);
    const np = asOf ? (mine.find((p) => p.setAt <= asOf) ?? mine.find((p) => p.isCurrent)) : mine[0];
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
      kitchenNotes: swaps.filter((s) => s.clientId === c.id && !s.swapRuleId && s.customRequest && swapActiveInWeek(s, weekStart))
        .map((s) => `Kitchen note: ${s.customRequest}${s.note ? ` (${s.note})` : ""}`),
      addons: addons.filter((a) => a.clientId === c.id && swapActiveInWeek(a, weekStart)).map((a): Addon => ({ kind: "extra_protein", slot: a.slot })),
    });
  }
  return out;
}

export function withDelivery(p: ClientPlanInput, deliveryOption: DeliveryOption): OrderClient {
  const { kitchenNotes: _notes, goal: _goal, ...rest } = p;
  void _notes; void _goal;
  return { ...rest, deliveryOption };
}
