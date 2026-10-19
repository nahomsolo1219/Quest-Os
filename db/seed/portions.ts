// Profile portions seed hook. STUB: qty = computed_qty = round(base) for all six profiles.
// The lead replaces this body with the domain portion engine (computeProfilePortions) later.
import type { DbOrTx } from "../client";
import * as s from "../schema";
import { PROFILES } from "../../src/domain/types";

export async function seedPortions(db: DbOrTx): Promise<{ inserted: number }> {
  const parts = await db.select({ id: s.parts.id, baseQty: s.parts.baseQty }).from(s.parts);
  const values = parts.flatMap((p) =>
    PROFILES.map((profile) => {
      const qty = Math.round(Number(p.baseQty));
      return { partId: p.id, profile, qty, computedQty: qty, isManual: false };
    }),
  );
  if (values.length === 0) return { inserted: 0 };
  const rows = await db.insert(s.profilePortions).values(values).onConflictDoNothing().returning({ id: s.profilePortions.id });
  return { inserted: rows.length };
}
