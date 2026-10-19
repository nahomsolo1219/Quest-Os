// Seed entry points shared by the CLI scripts and the db tests.
import type { DbOrTx } from "../client";
import { seedDemo } from "./demo";
import { seedPortions } from "./portions";
import { seedReference } from "./reference";

export { seedDemo, removeDemo, DEMO_STAFF, DEMO_CLIENTS, DEMO_STAFF_PASSWORD, DEMO_CLIENT_PASSWORD, demoPhone } from "./demo";
export { seedPortions } from "./portions";
export { seedReference } from "./reference";
export { addisToday } from "./dates";

export async function seedAll(db: DbOrTx, opts: { demo?: boolean; today?: string } = {}) {
  await seedReference(db);
  const portions = await seedPortions(db);
  const demo = opts.demo === false ? null : await seedDemo(db, { today: opts.today });
  return { portions, demo };
}
