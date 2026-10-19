// Shared fixtures for domain tests (not part of the public domain surface).
import type { LockClient, MenuData } from "./orders";
import { computeProfilePortions } from "./portions";
import { indexIngredients } from "./recipes";
import { seedIngredients, seedMeals, seedMenuDay, seedSwapRules } from "./seed-domain";
import { DEFAULT_NUTRITION, DEFAULT_PRICING, DEFAULT_SCHEDULE } from "./settings";
import { MENU_CODES, PROFILES, type Profile } from "./types";

export const ING = indexIngredients(seedIngredients());
const portions: MenuData["portions"] = {};
for (const p of PROFILES) {
  portions[p] = {};
  for (const menu of MENU_CODES) Object.assign(portions[p]!, computeProfilePortions({ menu, meals: seedMenuDay(menu) }, p, ING, DEFAULT_NUTRITION).qtyByPartId);
}
export const DATA: MenuData = { meals: seedMeals(), portions, swapRules: seedSwapRules(), ingredients: ING };
export const SETTINGS = { schedule: DEFAULT_SCHEDULE, pricing: DEFAULT_PRICING };

export function client(id: string, over: Partial<LockClient> = {}, profile: Profile = "M_LEAN"): LockClient {
  return {
    clientId: id, firstName: id, lastName: "Tester", allergies: [], dislikes: [], profile, deliveryOption: "daily", swapRuleIds: [], addons: [],
    subscription: { id: `sub-${id}`, status: "active", startDate: "2026-10-01", endDate: "2026-12-31" },
    pauses: [],
    paidInvoices: [{ periodStart: "2026-10-26", periodEnd: "2026-11-01", status: "paid" }],
    ...over,
  };
}

