// Portion profiles (SPEC document 3): per menu day and profile, scale protein / carb / fat parts so the
// day hits the size kcal (±3%) and the goal's macro grams (±10%), with factors clamped to [0.6, 1.8].
import { macroTargets, sizeAndGoalOf } from "./nutrition";
import { itemMacros, resolvePart, type IngredientIndex, type QtyByPartId } from "./recipes";
import type { NutritionSettings } from "./settings";
import type { Macros, Meal, MenuCode, Part, PartCategory, Profile } from "./types";

export type MenuDayInput = { menu: MenuCode; meals: Meal[] };
export type PortionGroup = "protein" | "carb" | "fat" | "fixed" | "untracked";
export type Factors = { protein: number; carb: number; fat: number };
type ScaledGroup = keyof Factors;
const GROUPS: ScaledGroup[] = ["protein", "carb", "fat"];

/** protein (+ dairy) / carb (+ fruit) / fat are scaled; veg and sauce stay at base; seasoning is untracked. */
export function portionGroupOf(category: PartCategory): PortionGroup {
  switch (category) {
    case "protein":
    case "dairy":
      return "protein";
    case "carb":
    case "fruit":
      return "carb";
    case "fat":
      return "fat";
    case "veg":
    case "sauce":
      return "fixed";
    default:
      return "untracked";
  }
}

/** Grams to the nearest step (default 5 g); pieces to whole pieces, at least 1 when qty ≥ 1. */
export function roundPortion(qty: number, unit: "g" | "piece", step = 5): number {
  if (unit === "piece") return Math.max(qty >= 1 ? 1 : 0, Math.round(qty));
  return Math.round(qty / step) * step;
}

/** Allowed rounded quantities for a part at the clamp: multiples of step (or whole pieces) within [min, max] × base. */
function allowedRange(part: Part, s: NutritionSettings): { lo: number; hi: number; step: number } {
  const step = part.unit === "piece" ? 1 : s.roundGramsTo;
  const lo = Math.ceil((part.baseQty * s.factorMin) / step - 1e-9) * step;
  const hi = Math.floor((part.baseQty * s.factorMax) / step + 1e-9) * step;
  if (lo > hi) {
    // no multiple inside the clamp (tiny parts): fall back to the plain rounded base
    const r = roundPortion(part.baseQty, part.unit, s.roundGramsTo);
    return { lo: r, hi: r, step };
  }
  return { lo, hi, step };
}

/** Rounds base × factor to the nearest allowed quantity that keeps the part inside the clamp. */
export function clampedRound(part: Part, factor: number, s: NutritionSettings): number {
  const { lo, hi, step } = allowedRange(part, s);
  const r = roundPortion(part.baseQty * factor, part.unit, step);
  return Math.min(hi, Math.max(lo, r));
}

export type PortionResult = {
  menu: MenuCode;
  profile: Profile;
  /** what the kitchen cooks: integer grams or pieces per part (manual cells kept) */
  qtyByPartId: QtyByPartId;
  /** the solver's own value for every part, even where a manual value is used */
  computedQtyByPartId: QtyByPartId;
  manualPartIds: string[];
  factors: Factors;
  /** day totals at the rounded quantities, one decimal */
  totals: Macros;
  target: Macros;
  /** relative deviation of the rounded totals from the target, e.g. 0.021 = +2.1% */
  deviation: { kcal: number; protein: number; carb: number; fat: number };
  clamped: boolean;
  flagged: boolean;
  flagReason?: string;
};

type Vec4 = [number, number, number, number]; // kcal, P, C, F
const toVec = (m: Macros): Vec4 => [m.kcal, m.proteinG, m.carbG, m.fatG];
const addVec = (a: Vec4, b: Vec4): Vec4 => [a[0] + b[0], a[1] + b[1], a[2] + b[2], a[3] + b[3]];
const scaleVec = (a: Vec4, f: number): Vec4 => [a[0] * f, a[1] * f, a[2] * f, a[3] * f];
const ZERO: Vec4 = [0, 0, 0, 0];

/** Solves the small symmetric system M x = b by Gaussian elimination; null when singular. */
function solve(M: number[][], b: number[]): number[] | null {
  const n = b.length;
  const A = M.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const k = A[r][c] / A[c][c];
      for (let j = c; j <= n; j++) A[r][j] -= k * A[c][j];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

/**
 * Box-constrained weighted least squares over the three group factors. Rows: kcal, P, C, F, each weighted
 * by 1 / (target × tolerance) so "inside tolerance" has the same meaning for every row. The optimum of this
 * convex problem is one of the 27 assignments {free, at min, at max}; every one is tried and the best
 * feasible one kept (this is the "clamp, then re-solve the remaining free factors" rule, done exhaustively).
 */
function solveFactors(cols: Record<ScaledGroup, Vec4>, fixed: Vec4, target: Vec4, weights: Vec4, s: NutritionSettings): Factors {
  const active = GROUPS.filter((g) => cols[g].some((v) => Math.abs(v) > 1e-9));
  const residual = (f: Factors): number => {
    let total: Vec4 = fixed;
    for (const g of GROUPS) total = addVec(total, scaleVec(cols[g], f[g]));
    return total.reduce((sum, v, i) => sum + ((v - target[i]) * weights[i]) ** 2, 0);
  };
  let best: Factors = { protein: 1, carb: 1, fat: 1 };
  let bestErr = Infinity;
  const states = ["free", "min", "max"] as const;
  const combos = 3 ** active.length;
  for (let c = 0; c < combos; c++) {
    const f: Factors = { protein: 1, carb: 1, fat: 1 };
    const free: ScaledGroup[] = [];
    let k = c;
    for (const g of active) {
      const st = states[k % 3];
      k = Math.floor(k / 3);
      if (st === "min") f[g] = s.factorMin;
      else if (st === "max") f[g] = s.factorMax;
      else free.push(g);
    }
    if (free.length > 0) {
      // rhs = target − fixed − clamped columns
      let rhsVec: Vec4 = addVec(target, scaleVec(fixed, -1));
      for (const g of active) if (!free.includes(g)) rhsVec = addVec(rhsVec, scaleVec(cols[g], -f[g]));
      const M = free.map((gi) => free.map((gj) => cols[gi].reduce((sum, v, r) => sum + v * cols[gj][r] * weights[r] ** 2, 0)));
      const b = free.map((gi) => cols[gi].reduce((sum, v, r) => sum + v * rhsVec[r] * weights[r] ** 2, 0));
      const x = solve(M, b);
      if (!x) continue;
      if (x.some((v) => v < s.factorMin - 1e-9 || v > s.factorMax + 1e-9)) continue;
      free.forEach((g, i) => (f[g] = x[i]));
    }
    const err = residual(f);
    if (err < bestErr - 1e-12) {
      bestErr = err;
      best = f;
    }
  }
  return best;
}

/**
 * Computes the six-profile portions for one menu day and one profile.
 * manual: partId -> qty set by the nutritionist; kept as is and treated as fixed during the solve.
 */
export function computeProfilePortions(
  day: MenuDayInput,
  profile: Profile,
  ingredients: IngredientIndex,
  s: NutritionSettings,
  manual: QtyByPartId = {},
): PortionResult {
  const { size, goal } = sizeAndGoalOf(profile);
  const kcalTarget = s.sizeKcal[size];
  const t = macroTargets(kcalTarget, goal, s);
  const target: Vec4 = [kcalTarget, t.proteinG, t.carbG, t.fatG];
  const weights: Vec4 = [
    1 / (kcalTarget * s.kcalTolerance),
    1 / (t.proteinG * s.macroTolerance),
    1 / (t.carbG * s.macroTolerance),
    1 / (t.fatG * s.macroTolerance),
  ];

  const parts = day.meals.flatMap((m) => m.parts);
  const macrosAt = (p: Part, qty: number): Vec4 => toVec(itemMacros(resolvePart(p, qty), ingredients));
  const baseVec = new Map(parts.map((p) => [p.id, macrosAt(p, p.baseQty)]));
  const isManual = (p: Part) => Object.prototype.hasOwnProperty.call(manual, p.id);
  const groupOf = (p: Part) => portionGroupOf(p.category);
  const scalable = parts.filter((p) => !isManual(p) && GROUPS.includes(groupOf(p) as ScaledGroup));

  // Fixed contributions: veg / sauce at base, manual cells at their value (seasoning contributes 0).
  let fixedBase: Vec4 = ZERO;
  for (const p of parts) {
    if (isManual(p)) fixedBase = addVec(fixedBase, macrosAt(p, manual[p.id]));
    else if (groupOf(p) === "fixed") fixedBase = addVec(fixedBase, baseVec.get(p.id)!);
  }

  // 1. continuous solve over all scalable parts
  const colsOf = (list: Part[]): Record<ScaledGroup, Vec4> => {
    const cols: Record<ScaledGroup, Vec4> = { protein: ZERO, carb: ZERO, fat: ZERO };
    for (const p of list) cols[groupOf(p) as ScaledGroup] = addVec(cols[groupOf(p) as ScaledGroup], baseVec.get(p.id)!);
    return cols;
  };
  const factors = solveFactors(colsOf(scalable), fixedBase, target, weights, s);

  // 2. piece parts (eggs, egg whites, injera) to whole pieces, then re-solve the gram parts around them
  const qty: QtyByPartId = {};
  let fixed2 = fixedBase;
  for (const p of scalable.filter((p) => p.unit === "piece")) {
    qty[p.id] = clampedRound(p, factors[groupOf(p) as ScaledGroup], s);
    fixed2 = addVec(fixed2, macrosAt(p, qty[p.id]));
  }
  const gramParts = scalable.filter((p) => p.unit === "g");
  const factors2 = solveFactors(colsOf(gramParts), fixed2, target, weights, s);
  for (const p of gramParts) qty[p.id] = clampedRound(p, factors2[groupOf(p) as ScaledGroup], s);

  // 3. local search on the rounded grid: move one part one step at a time while the weighted error drops
  const totalFor = (q: QtyByPartId): Vec4 => scalable.reduce((acc, p) => addVec(acc, macrosAt(p, q[p.id])), fixedBase);
  const errFor = (v: Vec4): number => v.reduce((sum, x, i) => sum + ((x - target[i]) * weights[i]) ** 2, 0);
  let err = errFor(totalFor(qty));
  for (let iter = 0; iter < 200; iter++) {
    let bestMove: { id: string; q: number; err: number } | null = null;
    for (const p of scalable) {
      const { lo, hi, step } = allowedRange(p, s);
      for (const dq of [-step, step]) {
        const q = qty[p.id] + dq;
        if (q < lo || q > hi) continue;
        const e = errFor(totalFor({ ...qty, [p.id]: q }));
        if (e < err - 1e-9 && (!bestMove || e < bestMove.err)) bestMove = { id: p.id, q, err: e };
      }
    }
    if (!bestMove) break;
    qty[bestMove.id] = bestMove.q;
    err = bestMove.err;
  }

  // assemble: every part of the day gets a quantity
  const computed: QtyByPartId = {};
  const final: QtyByPartId = {};
  for (const p of parts) {
    const g = groupOf(p);
    const c = qty[p.id] ?? (g === "fixed" || g === "untracked" ? p.baseQty : clampedRound(p, factors[g as ScaledGroup], s));
    computed[p.id] = c;
    final[p.id] = isManual(p) ? manual[p.id] : c;
  }
  // computed value for manual cells: what the solver gives for that cell without any manual cells
  const manualIds = parts.filter(isManual).map((p) => p.id);
  if (manualIds.length) {
    const auto = computeProfilePortions(day, profile, ingredients, s);
    for (const id of manualIds) computed[id] = auto.qtyByPartId[id];
  }

  const tot = parts.reduce<Vec4>((acc, p) => addVec(acc, macrosAt(p, final[p.id])), ZERO);
  const dev = { kcal: tot[0] / target[0] - 1, protein: tot[1] / target[1] - 1, carb: tot[2] / target[2] - 1, fat: tot[3] / target[3] - 1 };
  const reasons: string[] = [];
  const pct = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;
  if (Math.abs(dev.kcal) > s.kcalTolerance + 1e-9) reasons.push(`kcal ${Math.round(tot[0])} vs ${Math.round(target[0])} (${pct(dev.kcal)})`);
  const names = ["protein", "carb", "fat"] as const;
  names.forEach((n, i) => {
    if (Math.abs(dev[n]) > s.macroTolerance + 1e-9) reasons.push(`${n} ${Math.round(tot[i + 1])} g vs ${Math.round(target[i + 1])} g (${pct(dev[n])})`);
  });
  const clamped = GROUPS.some((g) => Math.abs(factors[g] - s.factorMin) < 1e-9 || Math.abs(factors[g] - s.factorMax) < 1e-9);
  if (reasons.length && clamped) reasons.push("a scale factor is at its clamp");

  const r1 = (x: number) => Math.round(x * 10) / 10;
  return {
    menu: day.menu,
    profile,
    qtyByPartId: final,
    computedQtyByPartId: computed,
    manualPartIds: parts.filter(isManual).map((p) => p.id),
    factors: { protein: r3(factors.protein), carb: r3(factors.carb), fat: r3(factors.fat) },
    totals: { kcal: r1(tot[0]), proteinG: r1(tot[1]), carbG: r1(tot[2]), fatG: r1(tot[3]) },
    target: { kcal: target[0], proteinG: r1(target[1]), carbG: r1(target[2]), fatG: r1(target[3]) },
    deviation: { kcal: r4(dev.kcal), protein: r4(dev.protein), carb: r4(dev.carb), fat: r4(dev.fat) },
    clamped,
    flagged: reasons.length > 0,
    flagReason: reasons.length ? reasons.join("; ") : undefined,
  };
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
