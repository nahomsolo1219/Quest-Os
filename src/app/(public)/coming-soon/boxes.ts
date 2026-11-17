// Example meals shown on the coming-soon label. Illustrative portions; real plans are set per client by the nutritionist.
export type Goal = "lose" | "build" | "healthy";
export type Fasting = "wed_fri" | "seasons" | "none";

type Food = { name: string; kcal: number; protein: number; carbs: number; fat: number }; // per gram
const CHICKEN: Food = { name: "Grilled chicken", kcal: 1.65, protein: 0.31, carbs: 0, fat: 0.036 };
const FISH: Food = { name: "Grilled fish", kcal: 1.28, protein: 0.26, carbs: 0, fat: 0.027 };
const MISIR: Food = { name: "Misir and soy", kcal: 1.3, protein: 0.15, carbs: 0.15, fat: 0.03 };
const RICE: Food = { name: "rice", kcal: 1.3, protein: 0.027, carbs: 0.28, fat: 0.003 };
const POTATO: Food = { name: "roast potato", kcal: 0.93, protein: 0.025, carbs: 0.2, fat: 0.02 };
const GREENS: Food = { name: "greens", kcal: 0.3, protein: 0.02, carbs: 0.05, fat: 0.01 };

const PORTIONS: Record<Goal, { p: number; c: number; v: number; plant: number; size: "S" | "M" | "L" }> = {
  lose: { p: 170, c: 100, v: 160, plant: 280, size: "M" },
  healthy: { p: 150, c: 150, v: 130, plant: 260, size: "M" },
  build: { p: 210, c: 220, v: 100, plant: 340, size: "L" },
};

export type Meal = { name: string; size: string; kcal: number; protein: number; carbs: number; fat: number };

export function mealFor(goal: Goal, fasting: Fasting): Meal {
  const x = PORTIONS[goal];
  // Wed & Fri meals use fish; the fasting-season meal is fully plant-based.
  const [protein, pg] = fasting === "none" ? [CHICKEN, x.p] : fasting === "wed_fri" ? [FISH, x.p + 20] : [MISIR, x.plant];
  const carb = fasting === "none" ? RICE : POTATO;
  const parts: [Food, number][] = [[protein, pg], [carb, x.c], [GREENS, x.v]];
  const sum = (k: keyof Omit<Food, "name">) => Math.round(parts.reduce((t, [f, g]) => t + f[k] * g, 0));
  return { name: `${protein.name}, ${carb.name} and ${GREENS.name}`, size: x.size, kcal: sum("kcal"), protein: sum("protein"), carbs: sum("carbs"), fat: sum("fat") };
}
