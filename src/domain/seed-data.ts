// Reference data transcribed from SPEC.md documents 4 to 6. Pure data, no database.
// Ids here are stable slugs; the database seed maps them to UUIDs.
// Used by the database seed (db/seed) and by domain tests.
import type { FoodGroup, MenuCode, PackageCode, PartCategory, PurchaseUnit, Slot, DeliveryOption } from "./types";

export type SeedIngredient = {
  slug: string;
  name: string;
  foodGroup: FoodGroup;
  purchaseUnit: PurchaseUnit;
  gramsPerUnit: number;
  nutritionBasis: "per_100g" | "per_piece";
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  stockSlug?: string;
  trackedInStock: boolean;
  shortShelfLife: boolean;
  isSeasoning: boolean;
};

const ing = (
  slug: string, name: string, foodGroup: FoodGroup, purchaseUnit: PurchaseUnit, gramsPerUnit: number,
  kcal: number, proteinG: number, carbG: number, fatG: number,
  extra: Partial<SeedIngredient> = {},
): SeedIngredient => ({
  slug, name, foodGroup, purchaseUnit, gramsPerUnit,
  nutritionBasis: purchaseUnit === "piece" ? "per_piece" : "per_100g",
  kcal, proteinG, carbG, fatG,
  trackedInStock: true, shortShelfLife: false, isSeasoning: false,
  ...extra,
});

// Document 5. Prices are intentionally empty (null) in the seed.
export const SEED_INGREDIENTS: SeedIngredient[] = [
  ing("chicken-breast", "Chicken breast", "chicken", "kg", 1000, 120, 23, 0, 2.6),
  ing("lean-beef-diced", "Lean beef, diced", "beef", "kg", 1000, 150, 21, 0, 7),
  ing("lean-minced-beef", "Lean minced beef", "beef", "kg", 1000, 170, 20, 0, 10),
  ing("tilapia-fillet", "Tilapia fillet", "fish", "kg", 1000, 96, 20, 0, 1.7, { shortShelfLife: true }),
  ing("eggs", "Eggs", "eggs", "piece", 50, 72, 6.3, 0.4, 4.8),
  ing("egg-white", "Egg white", "eggs", "piece", 33, 17, 3.6, 0.2, 0, { stockSlug: "eggs", trackedInStock: false }),
  ing("greek-yogurt", "Greek yogurt", "dairy", "kg", 1000, 97, 9, 4, 5),
  ing("ayib", "Ayib", "dairy", "kg", 1000, 98, 11, 3.4, 4.3),
  ing("feta", "Feta", "dairy", "kg", 1000, 264, 14, 4, 21),
  ing("mozzarella", "Mozzarella", "dairy", "kg", 1000, 280, 22, 3, 20),
  ing("dry-beans", "Dry beans", "legumes", "kg", 1000, 340, 21, 62, 1.2),
  ing("oats", "Oats", "grains", "kg", 1000, 389, 17, 66, 7),
  ing("rice", "Rice", "grains", "kg", 1000, 360, 7, 80, 0.6),
  ing("pasta", "Pasta", "grains", "kg", 1000, 371, 13, 75, 1.5),
  ing("lasagna-sheets", "Lasagna sheets", "grains", "kg", 1000, 371, 13, 75, 1.5),
  ing("potatoes", "Potatoes", "vegetables", "kg", 1000, 77, 2, 17, 0.1),
  ing("sweet-potatoes", "Sweet potatoes", "vegetables", "kg", 1000, 86, 1.6, 20, 0.1),
  ing("whole-wheat-bread", "Whole-wheat bread", "grains", "kg", 1000, 250, 12, 42, 3.5),
  ing("whole-wheat-tortillas", "Whole-wheat tortillas", "grains", "kg", 1000, 300, 9, 50, 7),
  ing("injera", "Injera", "grains", "piece", 120, 180, 6, 36, 1.2, { shortShelfLife: true }),
  ing("cabbage", "Cabbage", "vegetables", "kg", 1000, 25, 1.3, 6, 0.1),
  ing("carrot", "Carrot", "vegetables", "kg", 1000, 41, 0.9, 10, 0.2),
  ing("zucchini", "Zucchini", "vegetables", "kg", 1000, 17, 1.2, 3.1, 0.3),
  ing("onion", "Onion", "vegetables", "kg", 1000, 40, 1.1, 9, 0.1),
  ing("spinach", "Spinach", "vegetables", "kg", 1000, 23, 2.9, 3.6, 0.4),
  ing("tomatoes", "Tomatoes", "vegetables", "kg", 1000, 18, 0.9, 3.9, 0.2),
  ing("green-peppers", "Green peppers", "vegetables", "kg", 1000, 20, 0.9, 4.6, 0.2),
  ing("broccoli", "Broccoli", "vegetables", "kg", 1000, 34, 2.8, 7, 0.4),
  ing("cauliflower", "Cauliflower", "vegetables", "kg", 1000, 25, 1.9, 5, 0.3),
  ing("green-beans", "Green beans", "vegetables", "kg", 1000, 31, 1.8, 7, 0.2),
  ing("habesha-gomen", "Habesha gomen", "vegetables", "kg", 1000, 33, 2.7, 5.7, 0.7),
  ing("cucumber", "Cucumber", "vegetables", "kg", 1000, 15, 0.7, 3.6, 0.1),
  ing("banana", "Banana", "fruit", "kg", 1000, 89, 1.1, 23, 0.3),
  ing("apple", "Apple", "fruit", "kg", 1000, 52, 0.3, 14, 0.2),
  ing("papaya", "Papaya", "fruit", "kg", 1000, 43, 0.5, 11, 0.3),
  ing("cooking-oil", "Cooking oil", "oil", "litre", 920, 884, 0, 0, 100),
  ing("peanut-butter", "Peanut butter", "other", "kg", 1000, 588, 25, 20, 50),
  ing("cocoa", "Unsweetened cocoa", "other", "kg", 1000, 228, 20, 58, 14),
  ing("honey", "Honey", "other", "kg", 1000, 304, 0.3, 82, 0),
  ing("milk", "Milk", "dairy", "litre", 1030, 61, 3.2, 4.8, 3.3, { isSeasoning: true }),
  ing("stevia", "Stevia", "other", "kg", 1000, 0, 0, 0, 0, { isSeasoning: true }),
  ing("vanilla-extract", "Vanilla extract", "other", "litre", 1000, 0, 0, 0, 0, { isSeasoning: true }),
  ing("cinnamon", "Cinnamon", "other", "kg", 1000, 0, 0, 0, 0, { isSeasoning: true }),
  ing("baking-powder", "Baking powder", "other", "kg", 1000, 0, 0, 0, 0, { isSeasoning: true }),
  ing("mitmita", "Mitmita", "other", "kg", 1000, 0, 0, 0, 0, { isSeasoning: true }),
];

export type SeedPart = {
  name: string;
  category: PartCategory;
  unit: "g" | "piece";
  baseQty: number;
  /** ingredient slug -> qty at base (grams, or pieces for piece parts). Seasoning amounts are nominal per portion. */
  ingredients: [string, number][];
};

export type SeedMeal = {
  code: string;
  menu: MenuCode | null;
  slot: Slot;
  name: string;
  description: string;
  keepsDays: number;
  pantry: string[];
  parts: SeedPart[];
};

const g = (name: string, category: PartCategory, baseQty: number, ingredients: [string, number][]): SeedPart =>
  ({ name, category, unit: "g", baseQty, ingredients });
const pc = (name: string, category: PartCategory, baseQty: number, slug: string): SeedPart =>
  ({ name, category, unit: "piece", baseQty, ingredients: [[slug, baseQty]] });
/** seasoning: on the recipe card, nominal grams for stock only, never in macros or scaling */
const season = (name: string, ingredients: [string, number][]): SeedPart =>
  ({ name, category: "seasoning", unit: "g", baseQty: ingredients.reduce((s, [, q]) => s + q, 0), ingredients });

// Document 4.
export const SEED_MEALS: SeedMeal[] = [
  // Menu A (Monday and Friday)
  {
    code: "A_BREAKFAST", menu: "A", slot: "breakfast", name: "Peanut butter banana protein pancakes",
    description: "Oat pancakes made with eggs, Greek yogurt and banana, peanut butter on top.", keepsDays: 3, pantry: [],
    parts: [
      g("Oats", "carb", 50, [["oats", 50]]),
      pc("Whole egg", "protein", 1, "eggs"),
      pc("Egg whites", "protein", 3, "egg-white"),
      g("Greek yogurt", "protein", 100, [["greek-yogurt", 100]]),
      g("Banana", "fruit", 60, [["banana", 60]]),
      g("Peanut butter", "fat", 16, [["peanut-butter", 16]]),
      season("Cinnamon, stevia", [["cinnamon", 1], ["stevia", 1]]),
    ],
  },
  {
    code: "A_LUNCH", menu: "A", slot: "lunch", name: "Awaze chicken rice bowl",
    description: "Baked chicken in awaze over rice, with sautéed cabbage and carrot.", keepsDays: 3, pantry: ["Awaze", "Garlic", "Salt"],
    parts: [
      g("Awaze chicken", "protein", 130, [["chicken-breast", 130]]),
      g("Rice", "carb", 45, [["rice", 45]]),
      g("Sautéed cabbage and carrot", "veg", 200, [["cabbage", 120], ["carrot", 80]]),
      g("Oil", "fat", 7, [["cooking-oil", 7]]),
    ],
  },
  {
    code: "A_DINNER", menu: "A", slot: "dinner", name: "Rosemary beef with roast potatoes",
    description: "Diced lean beef with rosemary and garlic, roast potatoes, zucchini, carrot and a garlic-yogurt sauce.", keepsDays: 3,
    pantry: ["Rosemary", "Garlic", "Salt", "Black pepper"],
    parts: [
      g("Rosemary beef", "protein", 120, [["lean-beef-diced", 120]]),
      g("Roast potatoes", "carb", 150, [["potatoes", 150]]),
      g("Roast vegetables", "veg", 200, [["zucchini", 100], ["carrot", 60], ["onion", 40]]),
      g("Garlic-yogurt sauce", "protein", 30, [["greek-yogurt", 30]]),
      g("Oil", "fat", 13.5, [["cooking-oil", 13.5]]),
    ],
  },
  {
    code: "A_SNACK", menu: "A", slot: "snack", name: "Fudgy protein brownie",
    description: "Oat and cocoa brownie sweetened with stevia.", keepsDays: 4, pantry: [],
    parts: [
      g("Oats", "carb", 25, [["oats", 25]]),
      g("Cocoa", "carb", 10, [["cocoa", 10]]),
      pc("Whole egg", "protein", 1, "eggs"),
      g("Greek yogurt", "protein", 60, [["greek-yogurt", 60]]),
      season("Stevia, vanilla", [["stevia", 1], ["vanilla-extract", 2]]),
    ],
  },
  // Menu B (Tuesday and Saturday)
  {
    code: "B_BREAKFAST", menu: "B", slot: "breakfast", name: "Spinach and feta egg muffins",
    description: "Three baked egg muffins with spinach, tomato and feta, with toast.", keepsDays: 3, pantry: ["Salt", "Black pepper"],
    parts: [
      pc("Whole eggs", "protein", 2, "eggs"),
      pc("Egg whites", "protein", 4, "egg-white"),
      g("Spinach and tomato", "veg", 80, [["spinach", 50], ["tomatoes", 30]]),
      g("Feta", "fat", 20, [["feta", 20]]),
      g("Whole-wheat toast", "carb", 60, [["whole-wheat-bread", 60]]),
    ],
  },
  {
    code: "B_LUNCH", menu: "B", slot: "lunch", name: "Beef and bean chili with rice",
    description: "Lean beef and bean chili in a tomato and pepper sauce, over rice.", keepsDays: 4, pantry: ["Garlic", "Salt", "Black pepper"],
    parts: [
      g("Lean minced beef", "protein", 90, [["lean-minced-beef", 90]]),
      g("Beans", "carb", 40, [["dry-beans", 40]]),
      g("Rice", "carb", 35, [["rice", 35]]),
      g("Tomato and pepper sauce", "sauce", 150, [["tomatoes", 100], ["green-peppers", 30], ["onion", 20]]),
      g("Oil", "fat", 7, [["cooking-oil", 7]]),
    ],
  },
  {
    code: "B_DINNER", menu: "B", slot: "dinner", name: "Chicken and broccoli pasta bake",
    description: "Pasta baked with chicken, broccoli, carrot, garlic and a little mozzarella.", keepsDays: 3, pantry: ["Garlic", "Salt"],
    parts: [
      g("Pasta", "carb", 50, [["pasta", 50]]),
      g("Chicken", "protein", 110, [["chicken-breast", 110]]),
      g("Broccoli and carrot", "veg", 200, [["broccoli", 140], ["carrot", 60]]),
      g("Mozzarella", "fat", 15, [["mozzarella", 15]]),
      g("Oil", "fat", 7, [["cooking-oil", 7]]),
    ],
  },
  {
    code: "B_SNACK", menu: "B", slot: "snack", name: "Banana oat muffins (2)",
    description: "Small muffins with oats, banana, egg, cinnamon and stevia.", keepsDays: 4, pantry: [],
    parts: [
      g("Oats", "carb", 30, [["oats", 30]]),
      g("Banana", "fruit", 60, [["banana", 60]]),
      pc("Whole egg", "protein", 1, "eggs"),
      season("Stevia, cinnamon, baking powder", [["stevia", 1], ["cinnamon", 1], ["baking-powder", 2]]),
    ],
  },
  // Menu C (Wednesday and Sunday)
  {
    code: "C_BREAKFAST", menu: "C", slot: "breakfast", name: "Chicken breakfast burrito",
    description: "Scrambled eggs, chicken and tomato salsa in a whole-wheat tortilla.", keepsDays: 3, pantry: ["Salt"],
    parts: [
      g("Whole-wheat tortilla", "carb", 60, [["whole-wheat-tortillas", 60]]),
      pc("Whole eggs", "protein", 2, "eggs"),
      pc("Egg whites", "protein", 2, "egg-white"),
      g("Chicken", "protein", 50, [["chicken-breast", 50]]),
      g("Tomato salsa", "sauce", 60, [["tomatoes", 50], ["onion", 10]]),
    ],
  },
  {
    code: "C_LUNCH", menu: "C", slot: "lunch", name: "Doro tibs with gomen and injera",
    description: "Chicken tibs with Habesha gomen, injera and ayib. Injera packed separately.", keepsDays: 2, pantry: ["Garlic", "Salt"],
    parts: [
      g("Doro tibs", "protein", 130, [["chicken-breast", 130]]),
      g("Gomen and onion", "veg", 200, [["habesha-gomen", 170], ["onion", 30]]),
      pc("Injera", "carb", 1, "injera"),
      g("Ayib", "protein", 30, [["ayib", 30]]),
      g("Oil", "fat", 7, [["cooking-oil", 7]]),
    ],
  },
  {
    code: "C_DINNER", menu: "C", slot: "dinner", name: "Lean beef lasagna",
    description: "Layers of pasta, lean beef and tomato sauce with ayib and a little mozzarella. Freezes well.", keepsDays: 4,
    pantry: ["Garlic", "Mixed herbs", "Salt"],
    parts: [
      g("Lasagna sheets", "carb", 50, [["lasagna-sheets", 50]]),
      g("Lean minced beef", "protein", 100, [["lean-minced-beef", 100]]),
      g("Tomato sauce with vegetables", "sauce", 200, [["tomatoes", 130], ["carrot", 40], ["onion", 30]]),
      g("Ayib", "protein", 40, [["ayib", 40]]),
      g("Mozzarella", "fat", 15, [["mozzarella", 15]]),
    ],
  },
  {
    code: "C_SNACK", menu: "C", slot: "snack", name: "Chocolate peanut oat balls (3)",
    description: "No-bake balls with oats, peanut butter and cocoa, sweetened with stevia.", keepsDays: 5, pantry: [],
    parts: [
      g("Oats", "carb", 30, [["oats", 30]]),
      g("Peanut butter", "fat", 16, [["peanut-butter", 16]]),
      g("Cocoa", "carb", 5, [["cocoa", 5]]),
      season("Milk, stevia", [["milk", 15], ["stevia", 1]]),
    ],
  },
  // Menu D (Thursday)
  {
    code: "D_BREAKFAST", menu: "D", slot: "breakfast", name: "Apple cinnamon baked oats",
    description: "Oats baked with Greek yogurt, egg, apple and cinnamon.", keepsDays: 3, pantry: [],
    parts: [
      g("Oats", "carb", 60, [["oats", 60]]),
      g("Greek yogurt", "protein", 150, [["greek-yogurt", 150]]),
      pc("Whole egg", "protein", 1, "eggs"),
      g("Apple", "fruit", 90, [["apple", 90]]),
      season("Cinnamon, stevia", [["cinnamon", 1], ["stevia", 1]]),
    ],
  },
  {
    code: "D_LUNCH", menu: "D", slot: "lunch", name: "Honey-garlic chicken with sweet potato",
    description: "Glazed chicken with roasted sweet potato and green beans.", keepsDays: 3, pantry: ["Garlic", "Salt"],
    parts: [
      g("Honey-garlic chicken", "protein", 130, [["chicken-breast", 130]]),
      g("Sweet potato", "carb", 150, [["sweet-potatoes", 150]]),
      g("Green beans", "veg", 150, [["green-beans", 150]]),
      g("Honey", "carb", 7, [["honey", 7]]),
      g("Oil", "fat", 7, [["cooking-oil", 7]]),
    ],
  },
  {
    code: "D_DINNER", menu: "D", slot: "dinner", name: "Lemon-herb tilapia with mash",
    description: "Baked tilapia with lemon and herbs, mashed potato, cauliflower and carrot.", keepsDays: 2,
    pantry: ["Lemon", "Mixed herbs", "Garlic", "Salt", "Black pepper"],
    parts: [
      g("Tilapia", "protein", 180, [["tilapia-fillet", 180]]),
      g("Mashed potato", "carb", 200, [["potatoes", 200]]),
      g("Cauliflower and carrot", "veg", 150, [["cauliflower", 100], ["carrot", 50]]),
      g("Oil", "fat", 13.5, [["cooking-oil", 13.5]]),
    ],
  },
  {
    code: "D_SNACK", menu: "D", slot: "snack", name: "Yogurt cheesecake cup",
    description: "Greek yogurt and ayib whipped with stevia and vanilla, with papaya and oat crumble.", keepsDays: 3, pantry: [],
    parts: [
      g("Greek yogurt", "protein", 150, [["greek-yogurt", 150]]),
      g("Ayib", "protein", 40, [["ayib", 40]]),
      g("Papaya", "fruit", 80, [["papaya", 80]]),
      g("Oats", "carb", 10, [["oats", 10]]),
      season("Stevia, vanilla", [["stevia", 1], ["vanilla-extract", 2]]),
    ],
  },
  // Savory snack alternative (counts as a swap). Cucumber weight is a decision (DECISIONS D026).
  {
    code: "SAVORY_SNACK", menu: null, slot: "snack", name: "Boiled eggs, cucumber and mitmita",
    description: "Two boiled eggs and cucumber with mitmita.", keepsDays: 3, pantry: ["Salt"],
    parts: [
      pc("Boiled eggs", "protein", 2, "eggs"),
      g("Cucumber", "veg", 100, [["cucumber", 100]]),
      season("Mitmita", [["mitmita", 1]]),
    ],
  },
];

export type SeedSwapRule = {
  code: string;
  label: string;
  fromKind: "ingredient" | "slot";
  fromIngredientSlugs: string[];
  fromMealCodes: string[] | null;
  fromSlot: Slot | null;
  toIngredientSlug: string | null;
  /** optional split of the replacement across several ingredients (fractions sum to 1); overrides toIngredientSlug */
  toIngredientSplit?: [string, number][];
  toMealCode: string | null;
  /** same: same qty of the new ingredient; fixed: qtyValue of the new ingredient; multiply: qty × qtyValue;
   *  add: remove the from part and add qtyValue grams of the new ingredient to the meal's protein */
  qtyMode: "same" | "fixed" | "multiply" | "add";
  qtyValue: number | null;
  costMode: "zero" | "price_difference";
};

// Starter swap table (document 4).
export const SEED_SWAP_RULES: SeedSwapRule[] = [
  { code: "BEANS_TO_BEEF", label: "No beans → +60 g lean minced beef", fromKind: "ingredient", fromIngredientSlugs: ["dry-beans"], fromMealCodes: ["B_LUNCH"], fromSlot: null, toIngredientSlug: "lean-minced-beef", toMealCode: null, qtyMode: "add", qtyValue: 60, costMode: "price_difference" },
  { code: "TILAPIA_TO_CHICKEN", label: "Tilapia → chicken breast, same grams", fromKind: "ingredient", fromIngredientSlugs: ["tilapia-fillet"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "chicken-breast", toMealCode: null, qtyMode: "same", qtyValue: null, costMode: "zero" },
  { code: "BEEF_TO_CHICKEN", label: "Lean beef → chicken breast, same grams", fromKind: "ingredient", fromIngredientSlugs: ["lean-beef-diced", "lean-minced-beef"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "chicken-breast", toMealCode: null, qtyMode: "same", qtyValue: null, costMode: "zero" },
  { code: "CHICKEN_TO_BEEF", label: "Chicken breast → lean beef, same grams", fromKind: "ingredient", fromIngredientSlugs: ["chicken-breast"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "lean-beef-diced", toMealCode: null, qtyMode: "same", qtyValue: null, costMode: "price_difference" },
  { code: "INJERA_TO_RICE", label: "Injera → rice, 45 g dry", fromKind: "ingredient", fromIngredientSlugs: ["injera"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "rice", toMealCode: null, qtyMode: "fixed", qtyValue: 45, costMode: "zero" },
  { code: "RICE_TO_POTATOES", label: "Rice → potatoes, 150 g", fromKind: "ingredient", fromIngredientSlugs: ["rice"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "potatoes", toMealCode: null, qtyMode: "fixed", qtyValue: 150, costMode: "zero" },
  { code: "CHEESE_TO_AYIB", label: "Feta or mozzarella → ayib, double grams", fromKind: "ingredient", fromIngredientSlugs: ["feta", "mozzarella"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "ayib", toMealCode: null, qtyMode: "multiply", qtyValue: 2, costMode: "zero" },
  { code: "SWEET_TO_SAVORY_SNACK", label: "Sweet snack → savory snack (2 boiled eggs, cucumber, mitmita)", fromKind: "slot", fromIngredientSlugs: [], fromMealCodes: null, fromSlot: "snack", toIngredientSlug: null, toMealCode: "SAVORY_SNACK", qtyMode: "same", qtyValue: null, costMode: "zero" },
  { code: "PEANUT_TO_AYIB", label: "Peanut butter → ayib, 40 g (nut allergy)", fromKind: "ingredient", fromIngredientSlugs: ["peanut-butter"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "ayib", toMealCode: null, qtyMode: "fixed", qtyValue: 40, costMode: "zero" },
  { code: "GOMEN_TO_MIXED_VEG", label: "Gomen → mixed sautéed veg (cabbage and carrot), same grams", fromKind: "ingredient", fromIngredientSlugs: ["habesha-gomen"], fromMealCodes: null, fromSlot: null, toIngredientSlug: "cabbage", toIngredientSplit: [["cabbage", 0.6], ["carrot", 0.4]], toMealCode: null, qtyMode: "same", qtyValue: null, costMode: "zero" },
];

export type SeedPackage = {
  code: PackageCode;
  name: string;
  swapLimit: number;
  checkinIntervalDays: number;
  coaching: string;
  deliveryOptions: DeliveryOption[];
  serviceFeeMonthBirr: number;
  prioritySlot: boolean;
};

// Document 6.
export const SEED_PACKAGES: SeedPackage[] = [
  { code: "essential", name: "Essential", swapLimit: 3, checkinIntervalDays: 30, coaching: "Community access", deliveryOptions: ["pickup", "daily"], serviceFeeMonthBirr: 0, prioritySlot: false },
  { code: "performance", name: "Performance", swapLimit: 6, checkinIntervalDays: 14, coaching: "Community plus monthly group Q&A with Dagi and Kidus", deliveryOptions: ["daily"], serviceFeeMonthBirr: 0, prioritySlot: false },
  { code: "premium", name: "Premium", swapLimit: 10, checkinIntervalDays: 7, coaching: "Community plus monthly 1:1 coaching call", deliveryOptions: ["daily"], serviceFeeMonthBirr: 0, prioritySlot: true },
];

export const SEED_AREAS = ["Bole", "Kazanchis", "CMC", "Sarbet", "Piassa", "Megenagna", "Old Airport", "Ayat"];
