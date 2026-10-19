// Settings schemas and defaults. Stored in the `settings` table as one jsonb row per key.
// Owners edit them in /staff/settings; every change is audit-logged.
import { z } from "zod";
import { DELIVERY_OPTIONS, FOOD_GROUPS, MENU_CODES } from "./types";

const birr = z.number().int().nonnegative();
const pct = z.number().min(0).max(1);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm");

export const pricingSettingsSchema = z.object({
  /** buffer by food group, as a fraction (0.15 = 15%) */
  buffers: z.record(z.enum(FOOD_GROUPS), pct),
  dropCostBirr: birr,
  consultPerMonthBirr: birr,
  fixedCostsPerMonthBirr: birr,
  capacityClients: z.number().int().positive(),
  marginFloor: z.number().min(0).max(0.9),
  serviceDaysPerMonth: z.number().int().positive(),
  roundMonthTo: z.number().int().positive(),
  /** drops per month by delivery option */
  dropsPerMonth: z.record(z.enum(DELIVERY_OPTIONS), z.number().nonnegative()),
  /** delivery options clients can choose; weekly cannot be enabled while freshness is 3 days (DECISIONS) */
  enabledDeliveryOptions: z.array(z.enum(DELIVERY_OPTIONS)).min(1),
  /** rotation-week menu days used for food_day (spec: 7) */
  menuDaysPerWeek: z.number().int().positive(),
  priceLockMonths: z.number().int().positive(),
  quickStartRoundTo: z.number().int().positive(),
  extraProteinGrams: z.number().int().positive(),
});
export type PricingSettings = z.infer<typeof pricingSettingsSchema>;

export const DEFAULT_PRICING: PricingSettings = {
  buffers: {
    chicken: 0.15, beef: 0.1, fish: 0.1, eggs: 0.1, dairy: 0.1, vegetables: 0.1,
    fruit: 0.1, grains: 0.05, legumes: 0.05, oil: 0.1, other: 0.11,
  },
  dropCostBirr: 150,
  consultPerMonthBirr: 2200,
  fixedCostsPerMonthBirr: 38000,
  capacityClients: 12,
  marginFloor: 0.1,
  serviceDaysPerMonth: 26,
  roundMonthTo: 100,
  dropsPerMonth: { daily: 26, three_drops: 78, every_3_days: 9, weekly: 4.33, pickup: 0 },
  enabledDeliveryOptions: ["daily", "pickup"],
  menuDaysPerWeek: 7,
  priceLockMonths: 4,
  quickStartRoundTo: 10,
  extraProteinGrams: 50,
};

export const nutritionSettingsSchema = z.object({
  activityFactors: z.object({
    sedentary: z.number().positive(), light: z.number().positive(), moderate: z.number().positive(),
    very_active: z.number().positive(), athlete: z.number().positive(),
  }),
  goalFactors: z.object({ lean: z.number().positive(), build: z.number().positive() }),
  sizeKcal: z.object({ S: z.number().int().positive(), M: z.number().int().positive(), L: z.number().int().positive() }),
  /** fraction of kcal from protein / carbs / fat; each split sums to 1 */
  macroSplit: z.object({
    lean: z.object({ protein: pct, carb: pct, fat: pct }),
    build: z.object({ protein: pct, carb: pct, fat: pct }),
  }),
  kcalPerGram: z.object({ protein: z.number().positive(), carb: z.number().positive(), fat: z.number().positive() }),
  /** portion scaling */
  kcalTolerance: pct,
  macroTolerance: pct,
  factorMin: z.number().positive(),
  factorMax: z.number().positive(),
  roundGramsTo: z.number().int().positive(),
});
export type NutritionSettings = z.infer<typeof nutritionSettingsSchema>;

export const DEFAULT_NUTRITION: NutritionSettings = {
  activityFactors: { sedentary: 1.2, light: 1.375, moderate: 1.55, very_active: 1.725, athlete: 1.9 },
  goalFactors: { lean: 0.8, build: 1.1 },
  sizeKcal: { S: 1600, M: 2100, L: 2700 },
  macroSplit: {
    lean: { protein: 0.3, carb: 0.4, fat: 0.3 },
    build: { protein: 0.25, carb: 0.5, fat: 0.25 },
  },
  kcalPerGram: { protein: 4, carb: 4, fat: 9 },
  kcalTolerance: 0.03,
  macroTolerance: 0.1,
  factorMin: 0.6,
  factorMax: 1.8,
  roundGramsTo: 5,
};

export const scheduleSettingsSchema = z.object({
  /** ISO weekday (1 = Monday … 7 = Sunday) -> menu */
  rotation: z.object({
    1: z.enum(MENU_CODES), 2: z.enum(MENU_CODES), 3: z.enum(MENU_CODES), 4: z.enum(MENU_CODES),
    5: z.enum(MENU_CODES), 6: z.enum(MENU_CODES), 7: z.enum(MENU_CODES),
  }),
  /** ISO weekdays the kitchen cooks and delivers */
  serviceDays: z.array(z.number().int().min(1).max(7)).min(1),
  /** when Sunday is not a service day, Sunday's meals are cooked and dropped with Saturday */
  sundayWithSaturday: z.boolean(),
  weeklyCutoffWeekday: z.number().int().min(1).max(7),
  weeklyCutoffTime: hhmm,
  quickStartCutoffTime: hhmm,
  quickStartDailyCapacity: z.number().int().nonnegative(),
  freshnessDays: z.number().int().positive(),
  shortShelfLifeDays: z.number().int().positive(),
  /** on-time = delivered on the drop date at or before this time */
  deliveryDeadlineTime: hhmm,
  /** nutritionist confirms quick-start sizes within this many hours */
  quickStartConfirmHours: z.number().int().positive(),
});
export type ScheduleSettings = z.infer<typeof scheduleSettingsSchema>;

export const DEFAULT_SCHEDULE: ScheduleSettings = {
  rotation: { 1: "A", 2: "B", 3: "C", 4: "D", 5: "A", 6: "B", 7: "C" },
  serviceDays: [1, 2, 3, 4, 5, 6],
  sundayWithSaturday: true,
  weeklyCutoffWeekday: 4,
  weeklyCutoffTime: "18:00",
  quickStartCutoffTime: "18:00",
  quickStartDailyCapacity: 5,
  freshnessDays: 3,
  shortShelfLifeDays: 2,
  deliveryDeadlineTime: "12:00",
  quickStartConfirmHours: 48,
};

export const communitySettingsSchema = z.object({
  endedAccessDays: z.number().int().nonnegative(),
  maxPhotos: z.number().int().min(0).max(4),
  photoMaxEdgePx: z.number().int().positive(),
  pageSize: z.number().int().positive(),
});
export type CommunitySettings = z.infer<typeof communitySettingsSchema>;

export const DEFAULT_COMMUNITY: CommunitySettings = {
  endedAccessDays: 14,
  maxPhotos: 4,
  photoMaxEdgePx: 1600,
  pageSize: 20,
};

export const SETTINGS_SCHEMAS = {
  pricing: pricingSettingsSchema,
  nutrition: nutritionSettingsSchema,
  schedule: scheduleSettingsSchema,
  community: communitySettingsSchema,
} as const;

export const SETTINGS_DEFAULTS = {
  pricing: DEFAULT_PRICING,
  nutrition: DEFAULT_NUTRITION,
  schedule: DEFAULT_SCHEDULE,
  community: DEFAULT_COMMUNITY,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;
export type AllSettings = {
  pricing: PricingSettings;
  nutrition: NutritionSettings;
  schedule: ScheduleSettings;
  community: CommunitySettings;
};
