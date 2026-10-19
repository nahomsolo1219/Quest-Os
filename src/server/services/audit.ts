import { auditLog } from "@db/schema";
import type { DbOrTx } from "@db/client";
import type { Actor } from "@/server/authz";
import { SYSTEM_ACTOR } from "./context";

/** Writes one audit row: who, what, before, after, when (DATA-03). */
export async function writeAudit(db: DbOrTx, actor: Actor | null, entry: {
  action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null;
}) {
  const actorUserId = actor && actor.userId !== SYSTEM_ACTOR.userId ? actor.userId : null;
  await db.insert(auditLog).values({
    actorUserId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    reason: entry.reason ?? null,
  });
}
