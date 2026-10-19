// Plain-word labels for enum values shown on operations screens.
export const DELIVERY_LABEL: Record<string, string> = {
  daily: "Daily delivery", three_drops: "Three drops a day", every_3_days: "Every 3 days", weekly: "Weekly delivery", pickup: "Pick-up at the cafe",
};
export const SOURCE_LABEL: Record<string, string> = { instagram: "Instagram", referral: "Referral", walk_in: "Walk-in", other: "Other" };
export const ACTIVITY_LABEL: Record<string, string> = {
  sedentary: "Sedentary (desk job)", light: "Light (1–2 workouts a week)", moderate: "Moderate (3–4 a week)", very_active: "Very active (5–6 a week)", athlete: "Athlete (twice a day)",
};
export const GOAL_LABEL: Record<string, string> = { lean: "Lean", build: "Build" };
export const SEX_LABEL: Record<string, string> = { male: "Male", female: "Female" };
export const SLOT_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
export const METHOD_LABEL: Record<string, string> = { telebirr: "Telebirr", cbe: "CBE", cash: "Cash" };
export const INVOICE_KIND_LABEL: Record<string, string> = { weekly: "Weekly", monthly: "Monthly", quick_start: "Quick start", adjustment: "Adjustment" };
export const WEEKDAY_LABEL: Record<number, string> = { 1: "Monday", 2: "Tuesday", 3: "Wednesday", 4: "Thursday", 5: "Friday", 6: "Saturday", 7: "Sunday" };
export const SUB_STATUS_LABEL: Record<string, string> = {
  pending_payment: "Waiting for payment", active: "Active", paused: "Paused", ended: "Ended", cancelled: "Cancelled",
};
