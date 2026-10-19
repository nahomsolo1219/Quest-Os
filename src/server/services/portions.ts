// Profile portion table: recompute with the domain engine, keep manual cells (MENU-12), nutritionist edits.
import { and, eq } from "drizzle-orm";
import { profileDayResults, profilePortions } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan } from "@/server/authz";
import { computeProfilePortions } from "@/domain/portions";
import { MENU_CODES, PROFILES, type Profile } from "@/domain/types";
import { writeAudit } from "./audit";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { loadMenuData } from "./menu-data";
import { loadSettings } from "./settings";

/** Recomputes all six profiles for menus A–D (and replacement meals). Manual cells are kept and stay marked manual. */
export async function recomputePortionsRaw(db: DbOrTx, actorUserId: string | null = null) {
  const [data, settings] = await Promise.all([loadMenuData(db), loadSettings(db)]);
  const existing = await db.select().from(profilePortions);
  const manualBy = new Map<string, number>();
  for (const r of existing) if (r.isManual) manualBy.set(`${r.profile}:${r.partId}`, r.qty);
  const results: { menu: string; profile: Profile; flagged: boolean; flagReason?: string }[] = [];

  const days = [
    ...MENU_CODES.map((menu) => ({ menu, meals: data.mealList.filter((m) => m.menu === menu) })),
  ];
  // Replacement meals (savory snack) are scaled with menu A's factors so they follow the profile.
  const extras = data.mealList.filter((m) => m.menu === null);

  for (const profile of PROFILES) {
    for (const day of days) {
      const manual: Record<string, number> = {};
      for (const m of day.meals) for (const p of m.parts) {
        const k = manualBy.get(`${profile}:${p.id}`);
        if (k !== undefined) manual[p.id] = k;
      }
      const r = computeProfilePortions(day, profile, data.ingredients, settings.nutrition, manual);
      await upsertCells(db, profile, r.qtyByPartId, r.computedQtyByPartId, new Set(r.manualPartIds), actorUserId);
      await db.insert(profileDayResults).values({
        menu: day.menu, profile, kcal: Math.round(r.totals.kcal), proteinG: Math.round(r.totals.proteinG),
        carbG: Math.round(r.totals.carbG), fatG: Math.round(r.totals.fatG), factors: r.factors, flagged: r.flagged,
        flagReason: r.flagReason ?? null, computedAt: new Date(),
      }).onConflictDoUpdate({
        target: [profileDayResults.menu, profileDayResults.profile],
        set: { kcal: Math.round(r.totals.kcal), proteinG: Math.round(r.totals.proteinG), carbG: Math.round(r.totals.carbG),
          fatG: Math.round(r.totals.fatG), factors: r.factors, flagged: r.flagged, flagReason: r.flagReason ?? null, computedAt: new Date() },
      });
      results.push({ menu: day.menu, profile, flagged: r.flagged, flagReason: r.flagReason });
      if (day.menu === "A") {
        for (const m of extras) {
          const qty: Record<string, number> = {};
          for (const p of m.parts) {
            const f = p.category === "protein" || p.category === "dairy" ? r.factors.protein
              : p.category === "carb" || p.category === "fruit" ? r.factors.carb : p.category === "fat" ? r.factors.fat : 1;
            qty[p.id] = p.unit === "piece" ? Math.max(1, Math.round(p.baseQty * f)) : Math.max(5, Math.round((p.baseQty * f) / 5) * 5);
            if (p.category === "veg" || p.category === "sauce" || p.category === "seasoning") qty[p.id] = Math.round(p.baseQty);
          }
          const manualIds = new Set<string>();
          for (const p of m.parts) {
            const k = manualBy.get(`${profile}:${p.id}`);
            if (k !== undefined) { manualIds.add(p.id); }
          }
          const finalQty = { ...qty };
          for (const id of manualIds) finalQty[id] = manualBy.get(`${profile}:${id}`)!;
          await upsertCells(db, profile, finalQty, qty, manualIds, actorUserId);
        }
      }
    }
  }
  return results;
}

async function upsertCells(db: DbOrTx, profile: Profile, qty: Record<string, number>, computed: Record<string, number>,
  manual: Set<string>, actorUserId: string | null) {
  for (const partId of Object.keys(qty)) {
    const isManual = manual.has(partId);
    await db.insert(profilePortions).values({ partId, profile, qty: qty[partId], computedQty: computed[partId] ?? qty[partId], isManual, updatedByUserId: actorUserId })
      .onConflictDoUpdate({
        target: [profilePortions.partId, profilePortions.profile],
        set: { qty: qty[partId], computedQty: computed[partId] ?? qty[partId], isManual, ...(isManual ? {} : { updatedByUserId: actorUserId }), updatedAt: new Date() },
      });
  }
}

export async function recomputePortions(ctx: Ctx) {
  assertCan(ctx.actor, "portions.write");
  const results = await ctx.db.transaction((tx) => recomputePortionsRaw(tx, actorUserId(ctx.actor)));
  await writeAudit(ctx.db, ctx.actor, { action: "portions.recompute", entity: "profile_portions", entityId: "all",
    after: { flagged: results.filter((r) => r.flagged).map((r) => `${r.menu} ${r.profile}`) } });
  return results;
}

/** Nutritionist edits one cell; it becomes manual and is kept on recompute. qty null clears the manual value. */
export async function setPortionCell(ctx: Ctx, input: { partId: string; profile: Profile; qty: number | null }) {
  assertCan(ctx.actor, "portions.write");
  const [row] = await ctx.db.select().from(profilePortions)
    .where(and(eq(profilePortions.partId, input.partId), eq(profilePortions.profile, input.profile)));
  if (!row) throw new ServiceError("That portion cell does not exist.");
  if (input.qty !== null && (!Number.isInteger(input.qty) || input.qty < 0 || input.qty > 2000)) throw new ServiceError("Enter whole grams or pieces between 0 and 2000.");
  const next = input.qty === null ? { qty: row.computedQty, isManual: false } : { qty: input.qty, isManual: true };
  await ctx.db.update(profilePortions).set({ ...next, updatedByUserId: actorUserId(ctx.actor), updatedAt: ctx.now }).where(eq(profilePortions.id, row.id));
  await writeAudit(ctx.db, ctx.actor, { action: "portions.edit", entity: "profile_portions", entityId: row.id,
    before: { qty: row.qty, isManual: row.isManual }, after: next });
}
