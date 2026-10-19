// Profile portions seed hook: runs the domain portion engine (computeProfilePortions) through the
// portions service so seeded grams are the real six-profile table, not the base recipe.
import type { DbOrTx } from "../client";
import { recomputePortionsRaw } from "../../src/server/services/portions";

export async function seedPortions(db: DbOrTx): Promise<{ inserted: number; flagged: string[] }> {
  const results = await recomputePortionsRaw(db, null);
  return { inserted: results.length, flagged: results.filter((r) => r.flagged).map((r) => `${r.menu} ${r.profile}`) };
}
