// Example boxes shown on the coming-soon page. Illustrative portions; real plans are set per client by the nutritionist.
export type Goal = "lose" | "build" | "healthy";
export type Fasting = "wed_fri" | "seasons" | "none";

export type Part = { name: string; grams: number; kcal: number; protein: number; tone: string; texture: "grain" | "fleck" | "leaf" | "flake" };
export type Box = { protein: Part; carb: Part; veg: Part };

const chicken = (g: number): Part => ({ name: "Grilled chicken", grams: g, kcal: Math.round(g * 1.65), protein: Math.round(g * 0.31), tone: "#B9774A", texture: "flake" });
const misir = (g: number): Part => ({ name: "Misir and soy", grams: g, kcal: Math.round(g * 1.3), protein: Math.round(g * 0.15), tone: "#B4442C", texture: "fleck" });
const fish = (g: number): Part => ({ name: "Grilled fish", grams: g, kcal: Math.round(g * 1.28), protein: Math.round(g * 0.26), tone: "#D9B48A", texture: "flake" });
const rice = (g: number): Part => ({ name: "Rice", grams: g, kcal: Math.round(g * 1.3), protein: Math.round(g * 0.027), tone: "#EFE3BF", texture: "grain" });
const potato = (g: number): Part => ({ name: "Roast potato", grams: g, kcal: Math.round(g * 0.93), protein: Math.round(g * 0.025), tone: "#E1B866", texture: "grain" });
const greens = (g: number): Part => ({ name: "Gomen and greens", grams: g, kcal: Math.round(g * 0.3), protein: Math.round(g * 0.02), tone: "#8BC53F", texture: "leaf" });

const PORTIONS: Record<Goal, { p: number; c: number; v: number; lentil: number }> = {
  lose: { p: 170, c: 100, v: 160, lentil: 280 },
  healthy: { p: 150, c: 150, v: 130, lentil: 260 },
  build: { p: 210, c: 220, v: 100, lentil: 340 },
};

export function boxFor(goal: Goal, fasting: Fasting): Box {
  const x = PORTIONS[goal];
  // Wed & Fri boxes use fish; the fasting seasons box is fully plant-based.
  const protein = fasting === "none" ? chicken(x.p) : fasting === "wed_fri" ? fish(x.p + 20) : misir(x.lentil);
  return { protein, carb: fasting === "none" ? rice(x.c) : potato(x.c), veg: greens(x.v) };
}

export const totals = (b: Box) => ({
  kcal: b.protein.kcal + b.carb.kcal + b.veg.kcal,
  protein: b.protein.protein + b.carb.protein + b.veg.protein,
});
