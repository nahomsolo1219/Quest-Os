// Shared plain-data types for the domain layer. Mirrors the enums in db/schema.

export type DateStr = string; // 'YYYY-MM-DD' business date in Africa/Addis_Ababa

export const ROLES = ["owner", "operations", "nutritionist", "kitchen", "delivery", "coach", "client"] as const;
export type Role = (typeof ROLES)[number];

export const CLIENT_STATUSES = ["lead", "active", "paused", "ended"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export const LEAD_SOURCES = ["instagram", "referral", "walk_in", "other"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];

export const ACTIVITIES = ["sedentary", "light", "moderate", "very_active", "athlete"] as const;
export type Activity = (typeof ACTIVITIES)[number];

export const GOALS = ["lean", "build"] as const;
export type Goal = (typeof GOALS)[number];

export const SIZES = ["S", "M", "L"] as const;
export type Size = (typeof SIZES)[number];

export const PROFILES = ["S_LEAN", "S_BUILD", "M_LEAN", "M_BUILD", "L_LEAN", "L_BUILD"] as const;
export type Profile = (typeof PROFILES)[number];

export const FOOD_GROUPS = [
  "chicken", "beef", "fish", "eggs", "dairy", "vegetables", "fruit", "grains", "legumes", "oil", "other",
] as const;
export type FoodGroup = (typeof FOOD_GROUPS)[number];

export const PURCHASE_UNITS = ["kg", "litre", "piece"] as const;
export type PurchaseUnit = (typeof PURCHASE_UNITS)[number];

export const PART_CATEGORIES = ["protein", "carb", "fat", "veg", "dairy", "fruit", "sauce", "seasoning"] as const;
export type PartCategory = (typeof PART_CATEGORIES)[number];

export const MENU_CODES = ["A", "B", "C", "D"] as const;
export type MenuCode = (typeof MENU_CODES)[number];

export const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Slot = (typeof SLOTS)[number];

export const PACKAGE_CODES = ["essential", "performance", "premium"] as const;
export type PackageCode = (typeof PACKAGE_CODES)[number];

export const DELIVERY_OPTIONS = ["daily", "three_drops", "every_3_days", "weekly", "pickup"] as const;
export type DeliveryOption = (typeof DELIVERY_OPTIONS)[number];

export const BILLING_PERIODS = ["weekly", "monthly"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

export const SUBSCRIPTION_STATUSES = ["pending_payment", "active", "paused", "ended", "cancelled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_KINDS = ["weekly", "monthly", "quick_start", "adjustment"] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_STATUSES = ["issued", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = ["telebirr", "cbe", "cash"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ["submitted", "confirmed", "rejected"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const ORDER_STATUSES = ["locked", "skipped_unpaid", "paused"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DROP_STATUSES = ["pending", "delivered", "failed"] as const;
export type DropStatus = (typeof DROP_STATUSES)[number];

export const SWAP_STATUSES = ["requested", "approved", "rejected", "ended"] as const;
export type SwapStatus = (typeof SWAP_STATUSES)[number];

export const CONTRIBUTION_TYPES = ["cash", "time", "equipment", "other"] as const;
export type ContributionType = (typeof CONTRIBUTION_TYPES)[number];

export const POST_TYPES = ["post", "progress", "question", "announcement"] as const;
export type PostType = (typeof POST_TYPES)[number];

export const REACTIONS = ["like", "fire", "strong"] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REPORT_STATUSES = ["open", "resolved"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export type Macros = { kcal: number; proteinG: number; carbG: number; fatG: number };

/** Ingredient as the domain sees it. Nutrition is per 100 g, or per piece when basis is per_piece. */
export type Ingredient = {
  id: string;
  name: string;
  foodGroup: FoodGroup;
  purchaseUnit: PurchaseUnit;
  /** grams in one purchase unit (kg 1000, oil litre 920) or grams of one piece (egg 50, injera 120) */
  gramsPerUnit: number;
  nutritionBasis: "per_100g" | "per_piece";
  kcal: number;
  proteinG: number;
  carbG: number;
  fatG: number;
  /** cost per purchase unit in birr, null = price missing */
  costPerUnitBirr: number | null;
  /** e.g. egg white -> eggs: stock and cost come from this ingredient, 1 piece each */
  stockIngredientId: string | null;
  trackedInStock: boolean;
  shortShelfLife: boolean;
  isSeasoning: boolean;
};

export type PartIngredient = { ingredientId: string; qty: number };

export type Part = {
  id: string;
  mealId: string;
  name: string;
  category: PartCategory;
  unit: "g" | "piece";
  baseQty: number;
  ingredients: PartIngredient[];
  sort: number;
};

export type Meal = {
  id: string;
  code: string;
  menu: MenuCode | null;
  slot: Slot;
  name: string;
  description: string;
  keepsDays: number;
  parts: Part[];
};

/** A meal with the quantity of every part decided (profile portions, after swaps/add-ons). */
export type ResolvedItem = {
  partId: string;
  partName: string;
  category: PartCategory;
  unit: "g" | "piece";
  qty: number;
  ingredients: { ingredientId: string; qty: number }[];
  /** base-recipe qty of the part this item came from (lets swaps scale fixed amounts to the profile) */
  baseQty?: number;
  /** set when this item came from a swap or add-on */
  source?: { kind: "swap" | "addon"; code: string };
};

export type ResolvedMeal = {
  mealId: string;
  mealCode: string;
  mealName: string;
  slot: Slot;
  items: ResolvedItem[];
};
