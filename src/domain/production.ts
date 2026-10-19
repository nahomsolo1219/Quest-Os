// Kitchen outputs: production sheet, packing list, labels, eat-by (SPEC document 3 "Freshness labels").
import { displayName, profileLabel } from "./format";
import { SLOT_ORDER } from "./recipes";
import type { ScheduleSettings } from "./settings";
import { addDays } from "./time";
import type { DateStr, PartCategory, Profile, ResolvedItem, Slot } from "./types";
import { PROFILES } from "./types";

export const REHEAT_TEXT = "Reheat until steaming hot";

/** Eat-by = cook date + freshnessDays (3), or + shortShelfLifeDays (2) for fish / injera meals. */
export function eatBy(cookDate: DateStr, shortShelfLife: boolean, s?: Pick<ScheduleSettings, "freshnessDays" | "shortShelfLifeDays">): DateStr {
  return addDays(cookDate, shortShelfLife ? s?.shortShelfLifeDays ?? 2 : s?.freshnessDays ?? 3);
}

/** An order meal as stored (order_meals) plus the meal's display name. */
export type OrderMealRow = {
  id?: string;
  clientId: string;
  serviceDate: DateStr;
  mealId: string;
  mealName: string;
  slot: Slot;
  profile: Profile;
  items: ResolvedItem[];
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  conflicts: string[];
  cookDate: DateStr;
  eatBy: DateStr;
};

export type ProductionRow = {
  mealId: string;
  mealName: string;
  slot: Slot;
  partName: string;
  category: PartCategory;
  unit: "g" | "piece";
  perProfile: { profile: Profile; qty: number; count: number; total: number }[];
  total: number;
};

export type ProductionSheet = {
  cookDate: DateStr;
  mealsCount: number;
  rows: ProductionRow[];
  /** total per ingredient as cooked (egg whites stay whites here; shopping converts them to eggs) */
  ingredients: { ingredientId: string; qty: number }[];
};

/**
 * Production sheet for a cook date: one row per meal + part name, with qty per profile × number of portions.
 * Swapped and add-on items have their own part names, so they get their own rows.
 */
export function productionSheet(meals: OrderMealRow[], cookDate: DateStr): ProductionSheet {
  const day = meals.filter((m) => m.cookDate === cookDate);
  const rows = new Map<string, ProductionRow>();
  const ing = new Map<string, number>();
  for (const m of day) {
    for (const it of m.items) {
      const key = `${m.mealId}|${it.partName}|${it.unit}`;
      let row = rows.get(key);
      if (!row) {
        row = { mealId: m.mealId, mealName: m.mealName, slot: m.slot, partName: it.partName, category: it.category, unit: it.unit, perProfile: [], total: 0 };
        rows.set(key, row);
      }
      let cell = row.perProfile.find((p) => p.profile === m.profile && p.qty === it.qty);
      if (!cell) {
        cell = { profile: m.profile, qty: it.qty, count: 0, total: 0 };
        row.perProfile.push(cell);
      }
      cell.count += 1;
      cell.total = round1(cell.qty * cell.count);
      row.total = round1(row.total + it.qty);
      for (const pi of it.ingredients) ing.set(pi.ingredientId, round1((ing.get(pi.ingredientId) ?? 0) + pi.qty));
    }
  }
  const sorted = [...rows.values()].sort(
    (a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.mealName.localeCompare(b.mealName) || a.partName.localeCompare(b.partName),
  );
  for (const r of sorted) r.perProfile.sort((a, b) => PROFILES.indexOf(a.profile) - PROFILES.indexOf(b.profile) || a.qty - b.qty);
  return {
    cookDate,
    mealsCount: day.length,
    rows: sorted,
    ingredients: [...ing.entries()].map(([ingredientId, qty]) => ({ ingredientId, qty })).sort((a, b) => a.ingredientId.localeCompare(b.ingredientId)),
  };
}

export type PackingClient = { clientId: string; firstName: string; lastName: string; allergies: string[]; dislikes?: string[] };

export type PackingEntry = {
  clientId: string;
  name: string;
  allergies: string[];
  meals: { serviceDate: DateStr; mealName: string; slot: Slot; profile: Profile; items: { partName: string; qty: number; unit: "g" | "piece"; swapped: boolean }[]; conflicts: string[] }[];
  conflicts: string[];
  hasConflicts: boolean;
};

/** Packing list per client (sorted by name), conflicts flagged for the red highlight. */
export function packingList(meals: OrderMealRow[], clients: PackingClient[]): PackingEntry[] {
  const byClient = new Map(clients.map((c) => [c.clientId, c]));
  const groups = new Map<string, OrderMealRow[]>();
  for (const m of meals) groups.set(m.clientId, [...(groups.get(m.clientId) ?? []), m]);
  const out: PackingEntry[] = [];
  for (const [clientId, list] of groups) {
    const c = byClient.get(clientId);
    const sorted = [...list].sort((a, b) => (a.serviceDate < b.serviceDate ? -1 : a.serviceDate > b.serviceDate ? 1 : SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot)));
    const conflicts = [...new Set(sorted.flatMap((m) => m.conflicts))];
    out.push({
      clientId,
      name: c ? displayName(c.firstName, c.lastName) : clientId,
      allergies: c?.allergies ?? [],
      meals: sorted.map((m) => ({
        serviceDate: m.serviceDate,
        mealName: m.mealName,
        slot: m.slot,
        profile: m.profile,
        items: m.items.filter((i) => i.category !== "seasoning").map((i) => ({ partName: i.partName, qty: i.qty, unit: i.unit, swapped: !!i.source })),
        conflicts: m.conflicts,
      })),
      conflicts,
      hasConflicts: conflicts.length > 0,
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type Label = {
  clientId: string;
  /** first name + last initial */
  name: string;
  mealName: string;
  slot: Slot;
  profile: Profile;
  profileLabel: string;
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  serviceDate: DateStr;
  cookDate: DateStr;
  eatBy: DateStr;
  /** "Allergies: peanut, fish" or null */
  allergyNote: string | null;
  reheat: string;
};

export function labels(meals: OrderMealRow[], clients: PackingClient[]): Label[] {
  const byClient = new Map(clients.map((c) => [c.clientId, c]));
  return meals
    .map((m) => {
      const c = byClient.get(m.clientId);
      const allergies = (c?.allergies ?? []).map((a) => a.trim()).filter(Boolean);
      return {
        clientId: m.clientId,
        name: c ? displayName(c.firstName, c.lastName) : "",
        mealName: m.mealName,
        slot: m.slot,
        profile: m.profile,
        profileLabel: profileLabel(m.profile),
        kcal: m.kcal,
        proteinG: m.proteinG,
        carbG: m.carbG,
        fatG: m.fatG,
        serviceDate: m.serviceDate,
        cookDate: m.cookDate,
        eatBy: m.eatBy,
        allergyNote: allergies.length ? `Allergies: ${allergies.join(", ")}` : null,
        reheat: REHEAT_TEXT,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.serviceDate < b.serviceDate ? -1 : a.serviceDate > b.serviceDate ? 1 : 0) || SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));
}

const round1 = (x: number) => Math.round(x * 10) / 10;
