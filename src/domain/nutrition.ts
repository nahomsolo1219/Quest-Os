// Nutrition engine (SPEC document 3): BMR, TDEE, goal kcal, size, macro grams.
import type { NutritionSettings } from "./settings";
import type { Activity, Goal, Profile, Sex, Size } from "./types";
import { SIZES } from "./types";

export type BodyStats = { sex: Sex; weightKg: number; heightCm: number; age: number };
export type NutritionIntake = BodyStats & { activity: Activity; goal: Goal };
export type MacroGrams = { proteinG: number; carbG: number; fatG: number };

/** Mifflin-St Jeor. Unrounded. */
export function bmr(i: BodyStats): number {
  const base = 10 * i.weightKg + 6.25 * i.heightCm - 5 * i.age;
  return i.sex === "male" ? base + 5 : base - 161;
}

/** BMR × activity factor. Unrounded. */
export function tdee(bmrValue: number, activity: Activity, s: NutritionSettings): number {
  return bmrValue * s.activityFactors[activity];
}

/** TDEE × goal factor (lean 0.80, build 1.10 by default). Unrounded. */
export function goalKcal(tdeeValue: number, goal: Goal, s: NutritionSettings): number {
  return tdeeValue * s.goalFactors[goal];
}

/** Size whose kcal is nearest; ties go to the smaller size for Lean and the larger size for Build. */
export function pickSize(kcal: number, goal: Goal, s: NutritionSettings): Size {
  const sorted = [...SIZES].sort((a, b) => s.sizeKcal[a] - s.sizeKcal[b]);
  let best: Size = sorted[0];
  let bestDist = Infinity;
  for (const size of sorted) {
    const dist = Math.abs(kcal - s.sizeKcal[size]);
    if (dist < bestDist - 1e-9) {
      best = size;
      bestDist = dist;
    } else if (Math.abs(dist - bestDist) <= 1e-9 && goal === "build") {
      best = size; // tie: sizes are ascending, so a later size is larger
    }
  }
  return best;
}

/** Macro grams for a kcal target with the goal's split, 4/4/9 kcal per gram, rounded to whole grams. */
export function macroGrams(kcal: number, goal: Goal, s: NutritionSettings): MacroGrams {
  const split = s.macroSplit[goal];
  return {
    proteinG: Math.round((kcal * split.protein) / s.kcalPerGram.protein),
    carbG: Math.round((kcal * split.carb) / s.kcalPerGram.carb),
    fatG: Math.round((kcal * split.fat) / s.kcalPerGram.fat),
  };
}

/** Unrounded macro gram targets (used by the portion solver). */
export function macroTargets(kcal: number, goal: Goal, s: NutritionSettings): MacroGrams {
  const split = s.macroSplit[goal];
  return {
    proteinG: (kcal * split.protein) / s.kcalPerGram.protein,
    carbG: (kcal * split.carb) / s.kcalPerGram.carb,
    fatG: (kcal * split.fat) / s.kcalPerGram.fat,
  };
}

export type NutritionSuggestion = {
  bmr: number;
  tdee: number;
  /** goal-adjusted kcal, rounded */
  targetKcal: number;
  size: Size;
  /** kcal of the chosen size; the kitchen cooks to this */
  sizeKcal: number;
  profile: Profile;
} & MacroGrams;

/**
 * The calculator's suggestion. All values rounded to integers for storage.
 * Macro grams are computed from the size kcal (what the client actually eats), see DECISIONS D101.
 */
export function suggestNutrition(intake: NutritionIntake, s: NutritionSettings): NutritionSuggestion {
  const b = bmr(intake);
  const t = tdee(b, intake.activity, s);
  const target = goalKcal(t, intake.goal, s);
  const size = pickSize(target, intake.goal, s);
  const sizeKcal = s.sizeKcal[size];
  return {
    bmr: Math.round(b),
    tdee: Math.round(t),
    targetKcal: Math.round(target),
    size,
    sizeKcal,
    profile: profileOf(size, intake.goal),
    ...macroGrams(sizeKcal, intake.goal, s),
  };
}

export function profileOf(size: Size, goal: Goal): Profile {
  return `${size}_${goal.toUpperCase()}` as Profile;
}

export function sizeAndGoalOf(profile: Profile): { size: Size; goal: Goal } {
  const [size, goal] = profile.split("_");
  return { size: size as Size, goal: goal.toLowerCase() as Goal };
}
