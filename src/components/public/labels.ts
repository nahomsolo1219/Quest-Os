// Labels shared by the public calculator and the sign-up form (user-facing strings in one place).
import type { Activity, DeliveryOption, Goal, Sex, Size } from "@/domain/types";

export const SEX_LABELS: Record<Sex, string> = { male: "Male", female: "Female" };
export const ACTIVITY_LABELS: Record<Activity, string> = {
  sedentary: "Sedentary — desk job, little exercise",
  light: "Light — exercise 1–3 days a week",
  moderate: "Moderate — exercise 3–5 days a week",
  very_active: "Very active — hard exercise 6–7 days a week",
  athlete: "Athlete — training twice a day",
};
export const GOAL_LABELS: Record<Goal, { title: string; hint: string }> = {
  lean: { title: "Lean", hint: "Lose fat, keep muscle" },
  build: { title: "Build", hint: "Gain muscle and strength" },
};
export const SIZE_LABELS: Record<Size, string> = { S: "Small", M: "Medium", L: "Large" };
export const DELIVERY_LABELS: Record<DeliveryOption, string> = {
  daily: "Daily delivery (all meals in one drop)",
  three_drops: "Three drops a day",
  every_3_days: "Delivery every 3 days",
  weekly: "Weekly delivery",
  pickup: "Pick-up at Adorsi Cafe",
};
