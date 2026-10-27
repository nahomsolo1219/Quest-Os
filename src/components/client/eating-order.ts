import type { Slot } from "@/domain/types";

/** The order a client eats in (breakfast → snack → lunch → dinner); kitchen sheets keep their own order. */
export const EATING_ORDER: Slot[] = ["breakfast", "snack", "lunch", "dinner"];

export function byEatingOrder<M extends { slot: Slot }>(list: M[]): M[] {
  return [...list].sort((a, b) => EATING_ORDER.indexOf(a.slot) - EATING_ORDER.indexOf(b.slot));
}
