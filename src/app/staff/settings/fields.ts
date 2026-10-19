// Field layouts for the settings groups (plain data passed to the SettingsForm client component).
import type { FieldGroup } from "@/components/owner/settings-form";
import { DELIVERY_OPTIONS, FOOD_GROUPS, MENU_CODES } from "@/domain/types";

export const DELIVERY_LABELS: Record<(typeof DELIVERY_OPTIONS)[number], string> = {
  daily: "Daily, one drop", three_drops: "Three drops a day", every_3_days: "Every 3 days", weekly: "Weekly", pickup: "Pick-up at Adorsi Cafe",
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const PRICING_FIELDS: FieldGroup[] = [
  { title: "Price buffer by food group", help: "Added on top of ingredient cost for waste and price swings.",
    fields: FOOD_GROUPS.map((g) => ({ path: `buffers.${g}`, label: cap(g), kind: "pct", unit: "%" })) },
  { title: "Costs per month", fields: [
    { path: "dropCostBirr", label: "Cost per drop", kind: "int", unit: "ETB" },
    { path: "consultPerMonthBirr", label: "Consult per client", kind: "int", unit: "ETB" },
    { path: "fixedCostsPerMonthBirr", label: "Fixed costs", kind: "int", unit: "ETB" },
    { path: "capacityClients", label: "Clients to spread fixed costs over", kind: "int" },
  ] },
  { title: "Formula", fields: [
    { path: "marginFloor", label: "Margin floor", kind: "pct", unit: "%" },
    { path: "serviceDaysPerMonth", label: "Service days per month", kind: "int" },
    { path: "menuDaysPerWeek", label: "Menu days in the rotation week", kind: "int" },
    { path: "roundMonthTo", label: "Round monthly price to", kind: "int", unit: "ETB" },
    { path: "quickStartRoundTo", label: "Round quick-start amount to", kind: "int", unit: "ETB" },
    { path: "priceLockMonths", label: "Price lock", kind: "int", unit: "months" },
    { path: "extraProteinGrams", label: "Extra protein add-on", kind: "int", unit: "g" },
  ] },
  { title: "Delivery options", help: "Drops per month for each option, and which options clients can choose. Weekly cannot be enabled while food must be eaten within 3 days of cooking.",
    fields: [
      ...DELIVERY_OPTIONS.map((o) => ({ path: `dropsPerMonth.${o}`, label: `Drops/month: ${DELIVERY_LABELS[o]}`, kind: "num" as const })),
      { path: "enabledDeliveryOptions", label: "Enabled for clients", kind: "checks", options: DELIVERY_OPTIONS.map((o) => ({ value: o, label: DELIVERY_LABELS[o] })) },
    ] },
];

export const NUTRITION_FIELDS: FieldGroup[] = [
  { title: "Activity factors", help: "TDEE = BMR × factor.", fields: (["sedentary", "light", "moderate", "very_active", "athlete"] as const).map((a) => ({
    path: `activityFactors.${a}`, label: cap(a.replace("_", " ")), kind: "num" as const })) },
  { title: "Goal adjustment", fields: [
    { path: "goalFactors.lean", label: "Lean (× TDEE)", kind: "num" }, { path: "goalFactors.build", label: "Build (× TDEE)", kind: "num" }] },
  { title: "Size calories", fields: (["S", "M", "L"] as const).map((z) => ({ path: `sizeKcal.${z}`, label: `Size ${z}`, kind: "int" as const, unit: "kcal" })) },
  { title: "Macro split (share of kcal)", help: "Each goal must add up to 100%.", fields: (["lean", "build"] as const).flatMap((g) =>
    (["protein", "carb", "fat"] as const).map((m) => ({ path: `macroSplit.${g}.${m}`, label: `${cap(g)}: ${m === "carb" ? "carbs" : m}`, kind: "pct" as const, unit: "%" }))) },
  { title: "Energy per gram", fields: (["protein", "carb", "fat"] as const).map((m) => ({ path: `kcalPerGram.${m}`, label: m === "carb" ? "Carbs" : cap(m), kind: "num" as const, unit: "kcal/g" })) },
  { title: "Portion engine", fields: [
    { path: "kcalTolerance", label: "Day kcal tolerance", kind: "pct", unit: "±%" },
    { path: "macroTolerance", label: "Macro tolerance", kind: "pct", unit: "±%" },
    { path: "factorMin", label: "Smallest scale factor", kind: "num" },
    { path: "factorMax", label: "Largest scale factor", kind: "num" },
    { path: "roundGramsTo", label: "Round grams to", kind: "int", unit: "g" },
  ] },
];

export const SCHEDULE_FIELDS: FieldGroup[] = [
  { title: "Service days and rotation", fields: [
    { path: "serviceDays", label: "Service days (kitchen cooks and delivers)", kind: "checks", numeric: true, options: WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d })) },
    { path: "sundayWithSaturday", label: "Deliver Sunday's meals with Saturday's drop", kind: "bool" },
    ...WEEKDAYS.map((d, i) => ({ path: `rotation.${i + 1}`, label: `${d} menu`, kind: "select" as const, options: MENU_CODES.map((m) => ({ value: m, label: `Menu ${m}` })) })),
  ] },
  { title: "Cutoffs", fields: [
    { path: "weeklyCutoffWeekday", label: "Weekly cutoff day", kind: "select", numeric: true, options: WEEKDAYS.map((d, i) => ({ value: String(i + 1), label: d })) },
    { path: "weeklyCutoffTime", label: "Weekly cutoff time", kind: "time" },
    { path: "quickStartCutoffTime", label: "Quick-start cutoff (daily)", kind: "time" },
    { path: "deliveryDeadlineTime", label: "On-time delivery deadline", kind: "time" },
  ] },
  { title: "Quick starts and freshness", fields: [
    { path: "quickStartDailyCapacity", label: "Quick starts per day", kind: "int" },
    { path: "quickStartConfirmHours", label: "Nutritionist confirms within", kind: "int", unit: "hours" },
    { path: "freshnessDays", label: "Eat within (default)", kind: "int", unit: "days" },
    { path: "shortShelfLifeDays", label: "Eat within (fish, injera)", kind: "int", unit: "days" },
  ] },
];
