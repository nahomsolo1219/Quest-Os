import { describe, expect, it } from "vitest";
import { lockWeek } from "./orders";
import { client, DATA, SETTINGS } from "./test-fixtures";
import { eatBy, labels, packingList, productionSheet, REHEAT_TEXT, type OrderMealRow } from "./production";
import { DEFAULT_SCHEDULE } from "./settings";

const { orders } = lockWeek({
  weekStart: "2026-10-26",
  clients: [
    client("c1", { firstName: "Dagi", lastName: "Kebede", allergies: ["peanut"] }),
    client("c2", { firstName: "Hana", lastName: "Tesfaye" }),
    client("c3", { firstName: "Abel", lastName: "Girma", swapRuleIds: ["CHICKEN_TO_BEEF"] }, "S_LEAN"),
  ],
  data: DATA,
  settings: SETTINGS,
});
const rows: OrderMealRow[] = orders.flatMap((o) =>
  o.days.flatMap((d) => d.meals.map((m) => ({ ...m, clientId: o.clientId }))),
);
const people = [
  { clientId: "c1", firstName: "Dagi", lastName: "Kebede", allergies: ["peanut"] },
  { clientId: "c2", firstName: "Hana", lastName: "Tesfaye", allergies: [] },
  { clientId: "c3", firstName: "Abel", lastName: "Girma", allergies: [] },
];

describe("eat-by", () => {
  it("cook + 3 days, or + 2 for fish / injera (settings)", () => {
    expect(eatBy("2026-10-26", false, DEFAULT_SCHEDULE)).toBe("2026-10-29");
    expect(eatBy("2026-10-26", true, DEFAULT_SCHEDULE)).toBe("2026-10-28");
    expect(eatBy("2026-10-30", false)).toBe("2026-11-02");
    expect(eatBy("2026-10-26", false, { freshnessDays: 4, shortShelfLifeDays: 1 })).toBe("2026-10-30");
  });
});

describe("production sheet", () => {
  const sheet = productionSheet(rows, "2026-10-26");
  it("covers the cook date only", () => {
    expect(sheet.mealsCount).toBe(12); // 3 clients × 4 meals
  });
  it("totals qty per profile × count per part", () => {
    const chicken = sheet.rows.find((r) => r.mealId === "A_LUNCH" && r.partName === "Awaze chicken")!;
    const m = DATA.portions.M_LEAN!["A_LUNCH:0"];
    expect(chicken.perProfile).toEqual([{ profile: "M_LEAN", qty: m, count: 2, total: 2 * m }]);
    expect(chicken.total).toBe(2 * m);
    const beef = sheet.rows.find((r) => r.partName === "Awaze chicken → Lean beef, diced")!;
    const s = DATA.portions.S_LEAN!["A_LUNCH:0"];
    expect(beef.perProfile).toEqual([{ profile: "S_LEAN", qty: s, count: 1, total: s }]);
    const whites = sheet.rows.find((r) => r.mealId === "A_BREAKFAST" && r.partName === "Egg whites")!;
    expect(whites.unit).toBe("piece");
    expect(whites.perProfile.map((p) => p.profile)).toEqual(["S_LEAN", "M_LEAN"]);
  });
  it("totals per ingredient as cooked", () => {
    const chickenTotal = sheet.ingredients.find((i) => i.ingredientId === "chicken-breast")!.qty;
    expect(chickenTotal).toBe(2 * DATA.portions.M_LEAN!["A_LUNCH:0"]);
    expect(sheet.ingredients.find((i) => i.ingredientId === "egg-white")).toBeDefined();
  });
  it("orders rows by slot", () => {
    expect(sheet.rows[0].slot).toBe("breakfast");
    expect(sheet.rows.at(-1)!.slot).toBe("snack");
  });
});

describe("packing list and labels", () => {
  it("packs per client with conflicts flagged", () => {
    const p = packingList(rows.filter((r) => r.cookDate === "2026-10-26"), people);
    expect(p.map((x) => x.name)).toEqual(["Abel G.", "Dagi K.", "Hana T."]);
    const dagi = p.find((x) => x.clientId === "c1")!;
    expect(dagi.hasConflicts).toBe(true);
    expect(dagi.conflicts).toEqual(["Allergy: peanut (Peanut butter)"]);
    expect(dagi.meals).toHaveLength(4);
    expect(p.find((x) => x.clientId === "c3")!.meals[1].items[0].swapped).toBe(true);
    expect(dagi.meals[0].items.some((i) => i.partName.includes("Cinnamon"))).toBe(false); // seasoning not packed
  });

  it("labels carry name, meal, slot, profile, macros, dates, allergy note and reheat text", () => {
    const l = labels(rows.filter((r) => r.cookDate === "2026-10-29"), people);
    expect(l).toHaveLength(12);
    const dagiDinner = l.find((x) => x.clientId === "c1" && x.slot === "dinner")!;
    expect(dagiDinner).toMatchObject({
      name: "Dagi K.", mealName: "Lemon-herb tilapia with mash", profile: "M_LEAN", profileLabel: "M-Lean",
      cookDate: "2026-10-29", eatBy: "2026-10-31", allergyNote: "Allergies: peanut", reheat: REHEAT_TEXT,
    });
    expect(dagiDinner.kcal).toBeGreaterThan(0);
    expect(typeof dagiDinner.proteinG).toBe("number");
    expect(l.find((x) => x.clientId === "c2")!.allergyNote).toBeNull();
    expect(REHEAT_TEXT).toBe("Reheat until steaming hot");
  });
});
