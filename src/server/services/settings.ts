import { settings } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan, type Permission } from "@/server/authz";
import { SETTINGS_DEFAULTS, SETTINGS_SCHEMAS, type AllSettings, type SettingsKey } from "@/domain/settings";
import { writeAudit } from "./audit";
import { ServiceError, type Ctx } from "./context";

/** Loads all settings, falling back to defaults for missing keys or fields. No authorization: server-internal. */
export async function loadSettings(db: DbOrTx): Promise<AllSettings> {
  const rows = await db.select().from(settings);
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(SETTINGS_SCHEMAS) as SettingsKey[]) {
    const row = rows.find((r) => r.key === key);
    const merged = { ...SETTINGS_DEFAULTS[key], ...((row?.value as object | undefined) ?? {}) };
    const parsed = SETTINGS_SCHEMAS[key].safeParse(merged);
    out[key] = parsed.success ? parsed.data : SETTINGS_DEFAULTS[key];
  }
  return out as AllSettings;
}

const WRITE_PERMISSION: Record<SettingsKey, Permission> = {
  pricing: "pricing.write",
  nutrition: "settings.nutrition.write",
  schedule: "settings.write",
  community: "settings.write",
};

/** Validates and saves one settings group, with a change-log row (SET-02, PLN-03). */
export async function updateSettings<K extends SettingsKey>(ctx: Ctx, key: K, value: unknown, reason?: string) {
  assertCan(ctx.actor, WRITE_PERMISSION[key]);
  const parsed = SETTINGS_SCHEMAS[key].safeParse(value);
  if (!parsed.success) throw new ServiceError(parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
  const next = parsed.data as AllSettings[K];
  if (key === "pricing") {
    const p = next as AllSettings["pricing"];
    if (p.enabledDeliveryOptions.includes("weekly")) {
      const sched = (await loadSettings(ctx.db)).schedule;
      if (sched.freshnessDays <= 3) throw new ServiceError("Weekly delivery cannot be enabled: food must be delivered within 3 days of cooking.");
    }
  }
  return ctx.db.transaction(async (tx) => {
    const before = (await loadSettings(tx))[key];
    await tx.insert(settings).values({ key, value: next as never, updatedBy: actorId(ctx), updatedAt: ctx.now })
      .onConflictDoUpdate({ target: settings.key, set: { value: next as never, updatedBy: actorId(ctx), updatedAt: ctx.now } });
    await writeAudit(tx, ctx.actor, { action: "settings.update", entity: "settings", entityId: key, before, after: next, reason });
    return next;
  });
}

function actorId(ctx: Ctx) {
  return ctx.actor && ctx.actor.userId !== "00000000-0000-0000-0000-000000000000" ? ctx.actor.userId : null;
}

/** The subset a signed-out visitor may read for the public calculator (SEC-01). */
export async function publicCalculatorSettings(db: DbOrTx) {
  const s = await loadSettings(db);
  return {
    nutrition: s.nutrition,
    schedule: { quickStartCutoffTime: s.schedule.quickStartCutoffTime, serviceDays: s.schedule.serviceDays },
    pricing: { enabledDeliveryOptions: s.pricing.enabledDeliveryOptions },
  };
}
