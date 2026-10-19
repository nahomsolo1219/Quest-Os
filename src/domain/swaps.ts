// Swaps, add-ons, swap limits and allergy / dislike conflicts (SPEC document 4, business rule 3).
import { ceilTo } from "./money";
import type { IngredientIndex } from "./recipes";
import type { DateStr, ResolvedItem, ResolvedMeal, Slot, SwapStatus } from "./types";

export type SwapRule = {
  id: string;
  code: string;
  label: string;
  fromKind: "ingredient" | "slot";
  /** matches an item containing any of these ingredients */
  fromIngredientIds: string[];
  /** restricts the rule to these meal codes (e.g. beans only in the chili) */
  fromMealCodes: string[] | null;
  fromSlot: Slot | null;
  toIngredientId: string | null;
  /** split of the replacement across ingredients, fractions sum to 1; overrides toIngredientId */
  toIngredientSplit?: [string, number][] | null;
  /** slot rules: the meal that replaces the whole meal (savory snack) */
  toMealId: string | null;
  qtyMode: "same" | "fixed" | "multiply" | "add";
  qtyValue: number | null;
  costMode: "zero" | "price_difference";
  active: boolean;
  sort: number;
};

export type Addon = { kind: "extra_protein"; slot: Slot; grams?: number };

export type SwapContext = {
  ingredients: IngredientIndex;
  /** replacement meals for slot rules, by meal id (resolved at the portion the client gets) */
  replacementMeals?: Record<string, ResolvedMeal>;
  /** grams step for scaled fixed / add amounts (settings.nutrition.roundGramsTo) */
  roundGramsTo?: number;
  /** extra protein grams per add-on (settings.pricing.extraProteinGrams) */
  extraProteinGrams?: number;
};

const ingName = (ctx: SwapContext, id: string) => ctx.ingredients[id]?.name ?? id;
const roundStep = (q: number, step: number) => Math.max(step, Math.round(q / step) * step);

/** Profile ratio of an item: its qty over its base-recipe qty (1 when unknown). */
function profileRatio(item: ResolvedItem): number {
  return item.baseQty && item.baseQty > 0 ? item.qty / item.baseQty : 1;
}

function ruleApplies(rule: SwapRule, meal: ResolvedMeal): boolean {
  if (!rule.active) return false;
  if (rule.fromMealCodes && rule.fromMealCodes.length && !rule.fromMealCodes.includes(meal.mealCode)) return false;
  return true;
}

function replacementIngredients(rule: SwapRule, qty: number): { ingredientId: string; qty: number }[] {
  const split = rule.toIngredientSplit && rule.toIngredientSplit.length ? rule.toIngredientSplit : [[rule.toIngredientId!, 1] as [string, number]];
  let left = qty;
  return split.map(([id, frac], i) => {
    const q = i === split.length - 1 ? Math.round(left * 10) / 10 : Math.round(qty * frac * 10) / 10;
    left -= q;
    return { ingredientId: id, qty: q };
  });
}

function applyIngredientRule(meal: ResolvedMeal, rule: SwapRule, ctx: SwapContext): ResolvedMeal {
  const step = ctx.roundGramsTo ?? 5;
  const out: ResolvedItem[] = [];
  for (const item of meal.items) {
    const hit = !item.source && item.ingredients.some((pi) => rule.fromIngredientIds.includes(pi.ingredientId));
    if (!hit) {
      out.push(item);
      continue;
    }
    const kept = item.ingredients.filter((pi) => !rule.fromIngredientIds.includes(pi.ingredientId));
    const removed = item.ingredients.filter((pi) => rule.fromIngredientIds.includes(pi.ingredientId));
    const removedQty = removed.reduce((s, pi) => s + pi.qty, 0);
    const ratio = profileRatio(item);
    const source = { kind: "swap" as const, code: rule.code };
    const toLabel = rule.toIngredientSplit?.length
      ? rule.toIngredientSplit.map(([id]) => ingName(ctx, id)).join(" and ")
      : ingName(ctx, rule.toIngredientId ?? "");

    if (rule.qtyMode === "add") {
      // remove the from-ingredient; its part goes if nothing is left; extra grams of the new ingredient are added
      if (kept.length) out.push(withIngredients(item, kept));
      const grams = roundStep((rule.qtyValue ?? 0) * ratio, step);
      out.push({
        partId: `${item.partId}:swap:${rule.code}`,
        partName: `${item.partName} → extra ${toLabel}`,
        category: "protein",
        unit: "g",
        qty: grams,
        ingredients: [{ ingredientId: rule.toIngredientId!, qty: grams }],
        source,
      });
      continue;
    }

    let newQty: number;
    if (rule.qtyMode === "same") newQty = removedQty;
    else if (rule.qtyMode === "multiply") newQty = Math.round(removedQty * (rule.qtyValue ?? 1) * 10) / 10;
    else newQty = roundStep((rule.qtyValue ?? 0) * ratio, step); // fixed: base amount scaled to the profile

    // a piece ingredient swapped for a gram ingredient (injera -> rice) turns the item into grams
    const toUnit: "g" | "piece" =
      rule.qtyMode === "same" && item.unit === "piece" ? "piece" : rule.qtyMode === "fixed" ? "g" : item.unit;
    const ingredientsAfter = [...kept, ...replacementIngredients(rule, newQty)];
    const qtyAfter = toUnit === "g" ? Math.round(ingredientsAfter.reduce((s, pi) => s + pi.qty, 0) * 10) / 10 : newQty;
    out.push({
      ...item,
      partName: `${item.partName} → ${toLabel}`,
      unit: toUnit,
      qty: qtyAfter,
      ingredients: ingredientsAfter,
      source,
    });
  }
  return { ...meal, items: out };
}

function withIngredients(item: ResolvedItem, ingredients: { ingredientId: string; qty: number }[]): ResolvedItem {
  const qty = item.unit === "g" ? Math.round(ingredients.reduce((s, pi) => s + pi.qty, 0) * 10) / 10 : item.qty;
  return { ...item, ingredients, qty };
}

/** The meal's main protein: the gram protein item with the most grams (null when there is none). */
export function mainProteinItem(meal: ResolvedMeal): ResolvedItem | null {
  let best: ResolvedItem | null = null;
  for (const it of meal.items) {
    if (it.category !== "protein" && it.category !== "dairy") continue;
    if (it.unit !== "g" || it.ingredients.length === 0) continue;
    if (!best || it.qty > best.qty) best = it;
  }
  return best;
}

/** Extra protein add-on: +grams (default 50) of the meal's main protein, as its own item. */
export function applyAddons(meal: ResolvedMeal, addons: Addon[], ctx: SwapContext): ResolvedMeal {
  let items = meal.items;
  for (const a of addons) {
    if (a.kind !== "extra_protein" || a.slot !== meal.slot) continue;
    const main = mainProteinItem({ ...meal, items });
    if (!main) continue;
    const grams = a.grams ?? ctx.extraProteinGrams ?? 50;
    const ingredientId = [...main.ingredients].sort((x, y) => y.qty - x.qty)[0].ingredientId;
    items = [
      ...items,
      {
        partId: `${main.partId}:addon:extra_protein`,
        partName: `Extra ${ingName(ctx, ingredientId)}`,
        category: "protein",
        unit: "g",
        qty: grams,
        ingredients: [{ ingredientId, qty: grams }],
        source: { kind: "addon", code: "extra_protein" },
      },
    ];
  }
  return { ...meal, items };
}

/**
 * Applies the client's swap rules, then add-ons. Slot rules (sweet -> savory snack) replace the whole meal
 * first; ingredient rules then run in `sort` order, each on items no earlier swap produced.
 */
export function applySwaps(meal: ResolvedMeal, rules: SwapRule[], addons: Addon[], ctx: SwapContext): ResolvedMeal {
  const ordered = [...rules].filter((r) => ruleApplies(r, meal)).sort((a, b) => a.sort - b.sort);
  let out = meal;
  for (const r of ordered.filter((r) => r.fromKind === "slot")) {
    if (r.fromSlot !== out.slot || !r.toMealId || out.mealId === r.toMealId) continue;
    const replacement = ctx.replacementMeals?.[r.toMealId];
    if (!replacement) continue;
    out = {
      ...replacement,
      slot: out.slot,
      items: replacement.items.map((it) => ({ ...it, source: it.source ?? { kind: "swap", code: r.code } })),
    };
  }
  for (const r of ordered.filter((r) => r.fromKind === "ingredient")) out = applyIngredientRule(out, r, ctx);
  return applyAddons(out, addons, ctx);
}

/** Does this rule change anything in this meal? (used to show which swaps a client's menu actually uses) */
export function swapTouchesMeal(rule: SwapRule, meal: ResolvedMeal): boolean {
  if (!ruleApplies(rule, meal)) return false;
  if (rule.fromKind === "slot") return rule.fromSlot === meal.slot && meal.mealId !== rule.toMealId;
  return meal.items.some((it) => it.ingredients.some((pi) => rule.fromIngredientIds.includes(pi.ingredientId)));
}

/** Price per portion of extra protein: cost × (1 + buffer) ÷ (1 − margin floor), rounded UP to the nearest 10. */
export function extraProteinPrice(costBirr: number, buffer: number, marginFloor: number): number {
  return ceilTo((costBirr * (1 + buffer)) / (1 - marginFloor), 10);
}

export type ClientSwap = {
  swapRuleId: string | null;
  status: SwapStatus;
  effectiveWeekStart: DateStr;
  endedWeekStart: DateStr | null;
};

/** Is the swap in force for the week (effective on or before it and not ended by it)? */
export function swapActiveInWeek(s: Pick<ClientSwap, "effectiveWeekStart" | "endedWeekStart">, weekStart: DateStr): boolean {
  return s.effectiveWeekStart <= weekStart && (s.endedWeekStart == null || s.endedWeekStart > weekStart);
}

/**
 * Standing swaps that count against the package limit in a week: swap-table swaps that are approved or
 * awaiting approval and in force that week (see DECISIONS D108). Custom (non-table) swaps don't count.
 */
export function countStandingSwaps(clientSwaps: ClientSwap[], weekStart: DateStr): number {
  return clientSwaps.filter(
    (s) => s.swapRuleId != null && (s.status === "approved" || s.status === "requested") && swapActiveInWeek(s, weekStart),
  ).length;
}

export type SwapCheck = { ok: true } | { ok: false; reason: "limit" | "needs_approval" | "duplicate" };

/**
 * A request for a table swap is fine while the client is under the package limit; a request without a table
 * rule always needs the nutritionist; a request for a rule already standing is a duplicate.
 */
export function checkSwapRequest(
  pkg: { swapLimit: number },
  clientSwaps: ClientSwap[],
  ruleId: string | null,
  weekStart: DateStr,
): SwapCheck {
  if (ruleId == null) return { ok: false, reason: "needs_approval" };
  const standing = clientSwaps.filter(
    (s) => s.swapRuleId != null && (s.status === "approved" || s.status === "requested") && swapActiveInWeek(s, weekStart),
  );
  if (standing.some((s) => s.swapRuleId === ruleId)) return { ok: false, reason: "duplicate" };
  if (standing.length >= pkg.swapLimit) return { ok: false, reason: "limit" };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Allergy and dislike conflicts

/** A client term also matches these words (all lower case). */
export const CONFLICT_SYNONYMS: Record<string, string[]> = {
  fish: ["tilapia", "fish"],
  seafood: ["tilapia", "fish"],
  nut: ["peanut", "nut"],
  nuts: ["peanut", "nut"],
  "tree nut": ["nut"],
  peanut: ["peanut"],
  peanuts: ["peanut"],
  dairy: ["yogurt", "yoghurt", "ayib", "feta", "mozzarella", "milk", "cheese"],
  lactose: ["yogurt", "yoghurt", "ayib", "feta", "mozzarella", "milk", "cheese"],
  milk: ["milk", "yogurt", "yoghurt", "ayib", "feta", "mozzarella", "cheese"],
  cheese: ["cheese", "feta", "mozzarella", "ayib"],
  egg: ["egg"],
  eggs: ["egg"],
  gluten: ["bread", "tortilla", "pasta", "lasagna", "wheat"],
  wheat: ["bread", "tortilla", "pasta", "lasagna", "wheat"],
  beef: ["beef"],
  "red meat": ["beef"],
  meat: ["beef", "chicken"],
  chicken: ["chicken"],
  poultry: ["chicken"],
  bean: ["bean"],
  beans: ["bean"],
  legume: ["bean", "peanut"],
  legumes: ["bean", "peanut"],
  soy: ["soy"],
  cocoa: ["cocoa", "chocolate"],
  chocolate: ["cocoa", "chocolate"],
  spicy: ["mitmita", "awaze"],
};

export type Conflict = {
  term: string;
  kind: "allergy" | "dislike";
  /** the ingredient, part or meal name that matched */
  item: string;
  /** where it matched */
  on: "ingredient" | "part" | "meal";
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Words a client term should match: the term, its singular, and its synonyms. */
export function conflictWords(term: string): string[] {
  const t = term.trim().toLowerCase();
  if (!t) return [];
  const words = new Set<string>([t]);
  if (t.length > 3 && t.endsWith("s")) words.add(t.slice(0, -1));
  for (const w of CONFLICT_SYNONYMS[t] ?? []) words.add(w);
  for (const w of [...words]) for (const syn of CONFLICT_SYNONYMS[w] ?? []) words.add(syn);
  return [...words];
}

/** Case-insensitive match at the start of a word ("egg" matches "Eggs" and "Egg whites", "nut" not "Peanut"). */
export function termMatches(term: string, text: string): boolean {
  const hay = text.toLowerCase();
  return conflictWords(term).some((w) => new RegExp(`(^|[^a-z])${escapeRe(w)}`, "i").test(hay));
}

/**
 * Allergy / dislike terms checked against every ingredient name, part name and the meal name of a resolved
 * meal (run it on the meal after swaps: what is left is a conflict shown in red).
 */
export function findConflicts(
  allergies: string[],
  dislikes: string[],
  meal: ResolvedMeal,
  ingredients: IngredientIndex,
): Conflict[] {
  const out: Conflict[] = [];
  const seen = new Set<string>();
  const add = (c: Conflict) => {
    const key = `${c.kind}|${c.term.toLowerCase()}|${c.item.toLowerCase()}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  };
  const terms: [string, "allergy" | "dislike"][] = [
    ...allergies.map((t) => [t, "allergy"] as [string, "allergy"]),
    ...dislikes.map((t) => [t, "dislike"] as [string, "dislike"]),
  ];
  for (const [rawTerm, kind] of terms) {
    const term = rawTerm.trim();
    if (!term) continue;
    let matched = false;
    let handledBySwap = false;
    for (const item of meal.items) {
      for (const pi of item.ingredients) {
        const name = ingredients[pi.ingredientId]?.name ?? pi.ingredientId;
        if (termMatches(term, name)) {
          add({ term, kind, item: name, on: "ingredient" });
          matched = true;
        }
      }
      // a swapped item is named "Original → New": only the new side can conflict
      const [original, replaced] = item.partName.split(" → ");
      const current = item.source?.kind === "swap" && replaced ? replaced : item.partName;
      if (item.source?.kind === "swap" && replaced && termMatches(term, original)) handledBySwap = true;
      if (termMatches(term, current)) {
        add({ term, kind, item: item.partName, on: "part" });
        matched = true;
      }
    }
    // the meal name catches what the ingredient list cannot (e.g. "chili"), unless a swap removed the term
    if (!matched && !handledBySwap && termMatches(term, meal.mealName))
      add({ term, kind, item: meal.mealName, on: "meal" });
  }
  return out;
}

/** "Allergy: peanut (Peanut butter)" — one line per conflict, for order_meals.conflicts. */
export function conflictText(c: Conflict): string {
  return `${c.kind === "allergy" ? "Allergy" : "Dislike"}: ${c.term} (${c.item})`;
}
