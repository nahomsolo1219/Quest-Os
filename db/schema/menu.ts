// Ingredients, meals, parts, portions, swap rules, client swaps and add-ons (PLAN.md section 3, Menu and recipes).
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn, boolean, check, date, index, integer, jsonb, numeric, pgTable, text, unique, uuid,
} from "drizzle-orm/pg-core";
import { id, timestamps, tstz } from "./_common";
import { user } from "./auth";
import { clients } from "./core";
import { foodGroupEnum, menuCodeEnum, partCategoryEnum, profileEnum, purchaseUnitEnum, slotEnum, swapStatusEnum } from "./enums";

const macro = (name: string) => numeric(name, { precision: 7, scale: 2, mode: "number" }).notNull();
const qty1 = (name: string) => numeric(name, { precision: 8, scale: 1, mode: "number" });

export const ingredients = pgTable(
  "ingredients",
  {
    id: id(),
    /** stable natural key from the reference seed (e.g. chicken-breast) */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull().unique(),
    foodGroup: foodGroupEnum("food_group").notNull(),
    purchaseUnit: purchaseUnitEnum("purchase_unit").notNull(),
    gramsPerUnit: integer("grams_per_unit").notNull(),
    nutritionBasis: text("nutrition_basis").notNull(),
    kcal: macro("kcal"),
    proteinG: macro("protein_g"),
    carbG: macro("carb_g"),
    fatG: macro("fat_g"),
    /** per purchase unit; null = price missing */
    costPerUnitBirr: integer("cost_per_unit_birr"),
    supplier: text("supplier"),
    stockIngredientId: uuid("stock_ingredient_id").references((): AnyPgColumn => ingredients.id, { onDelete: "set null" }),
    trackedInStock: boolean("tracked_in_stock").notNull().default(true),
    shortShelfLife: boolean("short_shelf_life").notNull().default(false),
    isSeasoning: boolean("is_seasoning").notNull().default(false),
    ...timestamps(),
  },
  (t) => [check("ingredients_nutrition_basis_chk", sql`${t.nutritionBasis} in ('per_100g', 'per_piece')`)],
);

export const ingredientPrices = pgTable(
  "ingredient_prices",
  {
    id: id(),
    ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "cascade" }),
    costPerUnitBirr: integer("cost_per_unit_birr").notNull(),
    source: text("source").notNull(),
    /** purchases.id when source = purchase (no FK to keep the kitchen module independent) */
    purchaseId: uuid("purchase_id"),
    setByUserId: uuid("set_by_user_id").references(() => user.id, { onDelete: "set null" }),
    setAt: tstz("set_at").notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    index("ingredient_prices_ingredient_idx").on(t.ingredientId, t.setAt),
    check("ingredient_prices_source_chk", sql`${t.source} in ('purchase', 'manual')`),
  ],
);

export const meals = pgTable("meals", {
  id: id(),
  code: text("code").notNull().unique(),
  /** null for the savory snack alternative */
  menu: menuCodeEnum("menu"),
  slot: slotEnum("slot").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  keepsDays: integer("keeps_days").notNull(),
  /** pantry items shown on the recipe card, not tracked in stock */
  pantry: text("pantry").array().notNull().default(sql`'{}'::text[]`),
  sort: integer("sort").notNull().default(0),
  ...timestamps(),
});

export const parts = pgTable(
  "parts",
  {
    id: id(),
    mealId: uuid("meal_id").notNull().references(() => meals.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: partCategoryEnum("category").notNull(),
    unit: text("unit").notNull(),
    baseQty: qty1("base_qty").notNull(),
    sort: integer("sort").notNull().default(0),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("parts_meal_name_uq").on(t.mealId, t.name),
    index("parts_meal_id_idx").on(t.mealId),
    check("parts_unit_chk", sql`${t.unit} in ('g', 'piece')`),
  ],
);

export const partIngredients = pgTable(
  "part_ingredients",
  {
    id: id(),
    partId: uuid("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id, { onDelete: "restrict" }),
    qty: qty1("qty").notNull(),
    ...timestamps(),
  },
  (t) => [unique("part_ingredients_part_ingredient_uq").on(t.partId, t.ingredientId), index("part_ingredients_ingredient_idx").on(t.ingredientId)],
);

export const profilePortions = pgTable(
  "profile_portions",
  {
    id: id(),
    partId: uuid("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
    profile: profileEnum("profile").notNull(),
    qty: integer("qty").notNull(),
    computedQty: integer("computed_qty").notNull(),
    isManual: boolean("is_manual").notNull().default(false),
    updatedByUserId: uuid("updated_by_user_id").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [unique("profile_portions_part_profile_uq").on(t.partId, t.profile)],
);

export const profileDayResults = pgTable(
  "profile_day_results",
  {
    id: id(),
    menu: menuCodeEnum("menu").notNull(),
    profile: profileEnum("profile").notNull(),
    kcal: integer("kcal").notNull(),
    proteinG: integer("protein_g").notNull(),
    carbG: integer("carb_g").notNull(),
    fatG: integer("fat_g").notNull(),
    /** { protein, carb, fat } scaling factors */
    factors: jsonb("factors").notNull(),
    flagged: boolean("flagged").notNull().default(false),
    flagReason: text("flag_reason"),
    computedAt: tstz("computed_at").notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [unique("profile_day_results_menu_profile_uq").on(t.menu, t.profile)],
);

export const swapRules = pgTable(
  "swap_rules",
  {
    id: id(),
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    fromKind: text("from_kind").notNull(),
    /** any of these ingredients */
    fromIngredientIds: uuid("from_ingredient_ids").array().notNull().default(sql`'{}'::uuid[]`),
    /** restrict to these meals (e.g. chili only) */
    fromMealCodes: text("from_meal_codes").array(),
    fromSlot: slotEnum("from_slot"),
    toIngredientId: uuid("to_ingredient_id").references(() => ingredients.id, { onDelete: "restrict" }),
    /** optional split of the replacement: [{ ingredientId, fraction }] (fractions sum to 1); overrides to_ingredient_id */
    toIngredientSplit: jsonb("to_ingredient_split").$type<{ ingredientId: string; fraction: number }[] | null>(),
    /** savory snack alternative */
    toMealId: uuid("to_meal_id").references(() => meals.id, { onDelete: "restrict" }),
    qtyMode: text("qty_mode").notNull(),
    qtyValue: qty1("qty_value"),
    costMode: text("cost_mode").notNull(),
    active: boolean("active").notNull().default(true),
    sort: integer("sort").notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    check("swap_rules_from_kind_chk", sql`${t.fromKind} in ('ingredient', 'slot')`),
    check("swap_rules_qty_mode_chk", sql`${t.qtyMode} in ('same', 'fixed', 'multiply', 'add')`),
    check("swap_rules_cost_mode_chk", sql`${t.costMode} in ('zero', 'price_difference')`),
  ],
);

export const clientSwaps = pgTable(
  "client_swaps",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    /** null = custom request that needs the nutritionist */
    swapRuleId: uuid("swap_rule_id").references(() => swapRules.id, { onDelete: "restrict" }),
    customRequest: text("custom_request"),
    status: swapStatusEnum("status").notNull().default("requested"),
    effectiveWeekStart: date("effective_week_start", { mode: "string" }).notNull(),
    endedWeekStart: date("ended_week_start", { mode: "string" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedByUserId: uuid("decided_by_user_id").references(() => user.id, { onDelete: "set null" }),
    decidedAt: tstz("decided_at"),
    note: text("note"),
    ...timestamps(),
  },
  (t) => [index("client_swaps_client_idx").on(t.clientId, t.status)],
);

export const clientAddons = pgTable(
  "client_addons",
  {
    id: id(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("extra_protein"),
    slot: slotEnum("slot").notNull(),
    effectiveWeekStart: date("effective_week_start", { mode: "string" }).notNull(),
    endedWeekStart: date("ended_week_start", { mode: "string" }),
    pricePerPortionBirr: integer("price_birr_per_portion").notNull(),
    createdBy: uuid("created_by").references(() => user.id, { onDelete: "set null" }),
    ...timestamps(),
  },
  (t) => [index("client_addons_client_idx").on(t.clientId), check("client_addons_kind_chk", sql`${t.kind} in ('extra_protein')`)],
);
