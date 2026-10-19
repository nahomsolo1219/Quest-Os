import type { Db, DbOrTx } from "@db/client";
import type { Actor } from "@/server/authz";

/** Everything a service needs. `now` is injected so jobs, tests and the week simulation control time. */
export type Ctx = { db: Db; actor: Actor | null; now: Date };
export type TxCtx = { db: DbOrTx; actor: Actor | null; now: Date };

/** A user-facing error with a specific message (shown as-is in the UI). */
export class ServiceError extends Error {
  constructor(message: string, readonly code: string = "invalid") {
    super(message);
    this.name = "ServiceError";
  }
}

/** System actor for scheduled jobs and the simulation (all staff roles). */
export const SYSTEM_ACTOR: Actor = {
  userId: "00000000-0000-0000-0000-000000000000",
  roles: ["owner", "operations", "nutritionist", "kitchen", "delivery"],
  clientId: null,
  name: "Quest Meals (automatic)",
};
