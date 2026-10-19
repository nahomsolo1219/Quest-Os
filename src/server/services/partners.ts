// Partner contribution log (DSH-07): cash, time, equipment, other. Owners only. No equity maths.
import { arrayContains, asc, desc, eq } from "drizzle-orm";
import { partnerContributions, user } from "@db/schema";
import { assertCan } from "@/server/authz";
import { addisDate, isDateStr } from "@/domain/time";
import type { ContributionType, DateStr } from "@/domain/types";
import { writeAudit } from "./audit";
import { actorUserId, ServiceError, type Ctx } from "./context";

/** The partners: every owner user. */
export async function ownerUsers(ctx: Ctx) {
  assertCan(ctx.actor, "partners.read");
  return ctx.db.select({ id: user.id, name: user.name }).from(user).where(arrayContains(user.roles, ["owner"])).orderBy(asc(user.name));
}

export async function listContributions(ctx: Ctx) {
  assertCan(ctx.actor, "partners.read");
  const partner = user;
  const rows = await ctx.db.select({ c: partnerContributions, partnerName: partner.name }).from(partnerContributions)
    .innerJoin(partner, eq(partner.id, partnerContributions.partnerUserId))
    .orderBy(desc(partnerContributions.contributedOn), desc(partnerContributions.createdAt));
  const partners = await ownerUsers(ctx);
  const totals = partners.map((p) => {
    const mine = rows.filter((r) => r.c.partnerUserId === p.id);
    const byType: Record<ContributionType, number> = { cash: 0, time: 0, equipment: 0, other: 0 };
    for (const r of mine) byType[r.c.type]++;
    return {
      partnerUserId: p.id, name: p.name,
      cashBirr: mine.reduce((s, r) => s + (r.c.amountBirr ?? 0), 0),
      hours: Math.round(mine.reduce((s, r) => s + (r.c.hours ?? 0), 0) * 10) / 10,
      count: mine.length, byType,
    };
  });
  return { entries: rows, totals, partners };
}

export async function addContribution(ctx: Ctx, input: {
  partnerUserId: string; contributedOn: DateStr; type: ContributionType; amountBirr?: number | null; hours?: number | null; note?: string | null;
}) {
  assertCan(ctx.actor, "partners.write");
  const partners = await ownerUsers(ctx);
  if (!partners.some((p) => p.id === input.partnerUserId)) throw new ServiceError("Pick one of the partners (owners).");
  if (!isDateStr(input.contributedOn)) throw new ServiceError("Enter a valid date.");
  if (input.contributedOn > addisDate(ctx.now)) throw new ServiceError("A contribution cannot be in the future.");
  const amount = input.amountBirr ?? null;
  const hours = input.hours ?? null;
  if (amount !== null && (!Number.isInteger(amount) || amount <= 0)) throw new ServiceError("Amount must be whole birr above 0.");
  if (hours !== null && (!(hours > 0) || hours > 1000)) throw new ServiceError("Hours must be above 0.");
  if (input.type === "cash" && amount === null) throw new ServiceError("Enter the cash amount in birr.");
  if (input.type === "time" && hours === null) throw new ServiceError("Enter the hours given.");
  const note = input.note?.trim() || null;
  if ((input.type === "equipment" || input.type === "other") && !note) throw new ServiceError("Describe what was contributed in the note.");
  const [row] = await ctx.db.insert(partnerContributions).values({
    partnerUserId: input.partnerUserId, contributedOn: input.contributedOn, type: input.type,
    amountBirr: amount, hours: hours === null ? null : Math.round(hours * 10) / 10, note, createdBy: actorUserId(ctx.actor),
  }).returning();
  await writeAudit(ctx.db, ctx.actor, { action: "partner.add", entity: "partner_contributions", entityId: row.id,
    after: { partnerUserId: row.partnerUserId, contributedOn: row.contributedOn, type: row.type, amountBirr: row.amountBirr, hours: row.hours, note } });
  return row;
}

export async function deleteContribution(ctx: Ctx, input: { id: string }) {
  assertCan(ctx.actor, "partners.write");
  const [row] = await ctx.db.delete(partnerContributions).where(eq(partnerContributions.id, input.id)).returning();
  if (!row) throw new ServiceError("That entry was not found.");
  await writeAudit(ctx.db, ctx.actor, { action: "partner.delete", entity: "partner_contributions", entityId: row.id,
    before: { partnerUserId: row.partnerUserId, contributedOn: row.contributedOn, type: row.type, amountBirr: row.amountBirr, hours: row.hours, note: row.note } });
  return row;
}
