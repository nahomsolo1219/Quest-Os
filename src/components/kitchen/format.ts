// Display helpers for kitchen and purchasing quantities (grams, pieces, purchase units).
import type { PurchaseUnit } from "@/domain/types";

const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** "150 g", "2 pc"; grams of 1,000 or more also show kg: "4,350 g (4.35 kg)" when `withKg`. */
export function qty(n: number, unit: "g" | "piece", withKg = false): string {
  if (unit === "piece") return `${nf.format(n)} pc`;
  const g = `${nf.format(n)} g`;
  return withKg && n >= 1000 ? `${g} (${nf2.format(n / 1000)} kg)` : g;
}

const UNIT: Record<PurchaseUnit, [string, string]> = { kg: ["kg", "kg"], litre: ["litre", "litres"], piece: ["piece", "pieces"] };

/** "4.5 kg", "1 litre", "30 pieces" */
export function units(n: number, unit: PurchaseUnit): string {
  const [one, many] = UNIT[unit];
  return `${nf2.format(n)} ${n === 1 ? one : many}`;
}

export const SLOT_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
