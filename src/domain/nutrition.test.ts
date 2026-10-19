import { describe, expect, it } from "vitest";
import { bmr, goalKcal, macroGrams, macroTargets, pickSize, profileOf, sizeAndGoalOf, suggestNutrition, tdee } from "./nutrition";
import { DEFAULT_NUTRITION as N } from "./settings";

describe("BMR and TDEE (Mifflin-St Jeor)", () => {
  it("man 80 kg, 180 cm, 30 y: 10×80 + 6.25×180 − 5×30 + 5 = 1780", () => {
    const b = bmr({ sex: "male", weightKg: 80, heightCm: 180, age: 30 });
    expect(b).toBe(1780);
    expect(tdee(b, "moderate", N)).toBeCloseTo(2759, 9); // 1780 × 1.55
    expect(tdee(b, "sedentary", N)).toBeCloseTo(2136, 9); // × 1.2
    expect(tdee(b, "athlete", N)).toBeCloseTo(3382, 9); // × 1.9
  });

  it("woman 60 kg, 165 cm, 25 y: 600 + 1031.25 − 125 − 161 = 1345.25", () => {
    const b = bmr({ sex: "female", weightKg: 60, heightCm: 165, age: 25 });
    expect(b).toBe(1345.25);
    expect(tdee(b, "light", N)).toBeCloseTo(1849.71875, 9); // × 1.375
    expect(tdee(b, "very_active", N)).toBeCloseTo(2320.55625, 9); // × 1.725
  });

  it("goal factor: lean × 0.80, build × 1.10 (settings)", () => {
    expect(goalKcal(2759, "lean", N)).toBeCloseTo(2207.2, 9);
    expect(goalKcal(2759, "build", N)).toBeCloseTo(3034.9, 9);
    expect(goalKcal(2000, "lean", { ...N, goalFactors: { lean: 0.85, build: 1.1 } })).toBeCloseTo(1700, 9);
  });
});

describe("size selection", () => {
  it("picks the nearest size", () => {
    expect(pickSize(1500, "lean", N)).toBe("S");
    expect(pickSize(1849, "build", N)).toBe("S");
    expect(pickSize(1851, "lean", N)).toBe("M");
    expect(pickSize(2207.2, "lean", N)).toBe("M");
    expect(pickSize(3034.9, "build", N)).toBe("L");
  });
  it("ties go to the smaller size for Lean and the larger for Build", () => {
    expect(pickSize(1850, "lean", N)).toBe("S");
    expect(pickSize(1850, "build", N)).toBe("M");
    expect(pickSize(2400, "lean", N)).toBe("M");
    expect(pickSize(2400, "build", N)).toBe("L");
  });
});

describe("macros", () => {
  it("uses the goal split with 4/4/9 and rounds to whole grams", () => {
    // lean 2100: P 2100×0.30÷4 = 157.5 -> 158, C 2100×0.40÷4 = 210, F 2100×0.30÷9 = 70
    expect(macroGrams(2100, "lean", N)).toEqual({ proteinG: 158, carbG: 210, fatG: 70 });
    // build 2100: P 131.25 -> 131, C 262.5 -> 263, F 58.33 -> 58
    expect(macroGrams(2100, "build", N)).toEqual({ proteinG: 131, carbG: 263, fatG: 58 });
    expect(macroGrams(1600, "lean", N)).toEqual({ proteinG: 120, carbG: 160, fatG: 53 });
    expect(macroTargets(2700, "build", N).fatG).toBeCloseTo(75, 9);
  });

  it("suggests a full profile from intake", () => {
    const s = suggestNutrition({ sex: "male", weightKg: 80, heightCm: 180, age: 30, activity: "moderate", goal: "lean" }, N);
    expect(s).toEqual({ bmr: 1780, tdee: 2759, targetKcal: 2207, size: "M", sizeKcal: 2100, profile: "M_LEAN", proteinG: 158, carbG: 210, fatG: 70 });
    const w = suggestNutrition({ sex: "female", weightKg: 60, heightCm: 165, age: 25, activity: "light", goal: "lean" }, N);
    expect(w).toMatchObject({ bmr: 1345, tdee: 1850, targetKcal: 1480, size: "S", sizeKcal: 1600, profile: "S_LEAN" });
  });

  it("maps size and goal to a profile and back", () => {
    expect(profileOf("S", "build")).toBe("S_BUILD");
    expect(profileOf("L", "lean")).toBe("L_LEAN");
    expect(sizeAndGoalOf("M_BUILD")).toEqual({ size: "M", goal: "build" });
  });
});
