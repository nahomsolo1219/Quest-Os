// Invoices, receipt upload, payment confirmation (module 6). Unpaid = not cooked is enforced by the locks.
import { and, asc, desc, eq, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import { accountCredits, clients, invoices, pauses, payments, subscriptions } from "@db/schema";
import type { DbOrTx } from "@db/client";
import { assertCan, assertCanForClient, ForbiddenError } from "@/server/authz";
import { putImage, storage, parseKey } from "@/server/storage";
import { nextInvoicesToGenerate } from "@/domain/subscriptions";
import { formatBirr } from "@/domain/money";
import type { DateStr, PaymentMethod } from "@/domain/types";
import { writeAudit } from "./audit";
import { actorUserId, ServiceError, type Ctx } from "./context";
import { notify, userIdsWithRoles } from "./notifications";
import { loadSettings } from "./settings";

/** Generates the next period invoices for every live subscription at the Thursday lock (idempotent). */
export async function generateInvoicesForLock(db: DbOrTx, lockWeek: DateStr): Promise<{ created: number }> {
  const subs = await db.select().from(subscriptions).where(inArray(subscriptions.status, ["active", "paused", "pending_payment"]));
  let created = 0;
  for (const sub of subs) {
    if (sub.isQuickStart && sub.status === "pending_payment") continue; // quick starts pay their first invoice first
    created += await generateInvoicesForSubscription(db, sub.id, lockWeek);
  }
  return { created };
}

/**
 * Invoices for one subscription for every period starting by the end of the week after `lockWeek`, skipping
 * paused weeks and periods already covered (D021). Runs in one transaction so an open credit is applied exactly once.
 * Called by the Thursday lock and when a plan is created (so a quick start's first regular week is billed before
 * the cutoff that locks it).
 */
export async function generateInvoicesForSubscription(db: DbOrTx, subscriptionId: string, lockWeek: DateStr): Promise<number> {
  const settings = await loadSettings(db);
  return db.transaction(async (tx) => {
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, subscriptionId)).for("update");
    if (!sub || !["active", "paused", "pending_payment"].includes(sub.status)) return 0;
    const [existing, pauseRows] = await Promise.all([
      tx.select().from(invoices).where(eq(invoices.subscriptionId, sub.id)),
      tx.select().from(pauses).where(eq(pauses.subscriptionId, sub.id)),
    ]);
    const drafts = nextInvoicesToGenerate(
      { startDate: sub.startDate, endDate: sub.endDate, billingPeriod: sub.billingPeriod, planPriceBirr: sub.planPriceBirr,
        discountMonthBirr: sub.discountMonthBirr, quickStartPeriodEnd: sub.quickStartPeriodEnd,
        pauses: pauseRows.map((p) => ({ startWeek: p.startWeek, weeks: p.weeks })) },
      existing.map((i) => ({ periodStart: i.periodStart, periodEnd: i.periodEnd, status: i.status, kind: i.kind })),
      lockWeek, settings,
    );
    let created = 0;
    for (const d of drafts) {
      const credits = await tx.select().from(accountCredits)
        .where(and(eq(accountCredits.clientId, sub.clientId), isNull(accountCredits.appliedInvoiceId))).for("update");
      const credit = credits.reduce((n, c) => n + c.amountBirr, 0);
      // positive credit lowers the invoice (never below 0); a negative balance (client owes) is added
      const apply = credit > 0 ? Math.min(credit, d.amountBirr) : credit;
      const [row] = await tx.insert(invoices).values({
        clientId: sub.clientId, subscriptionId: sub.id, kind: d.kind, periodStart: d.start, periodEnd: d.end,
        serviceDays: d.serviceDays, amountBirr: d.amountBirr - apply, creditAppliedBirr: apply,
        status: d.amountBirr - apply === 0 ? "paid" : "issued", dueAt: d.dueAt, isDemo: sub.isDemo,
      }).onConflictDoNothing().returning();
      if (!row) continue;
      created++;
      if (credits.length && apply !== 0) {
        await tx.update(accountCredits).set({ appliedInvoiceId: row.id }).where(inArray(accountCredits.id, credits.map((c) => c.id)));
        if (credit - apply !== 0) {
          await tx.insert(accountCredits).values({ clientId: sub.clientId, amountBirr: credit - apply, reason: "Remaining credit carried forward" });
        }
      }
    }
    return created;
  });
}

/** Voids an invoice and gives back any credit it had used (pauses). */
export async function voidInvoice(db: DbOrTx, invoiceId: string, reason: string) {
  const [inv] = await db.update(invoices).set({ status: "void" }).where(and(eq(invoices.id, invoiceId), ne(invoices.status, "void"))).returning();
  if (inv && inv.creditAppliedBirr !== 0) {
    await db.insert(accountCredits).values({ clientId: inv.clientId, amountBirr: inv.creditAppliedBirr, reason: `Credit returned: ${reason}` });
  }
  return inv ?? null;
}


/** A client's invoices with payments (staff or the client). */
export async function listClientInvoices(ctx: Ctx, clientId: string) {
  assertCanForClient(ctx.actor, clientId, "invoices.read", "invoices.readOwn");
  const inv = await ctx.db.select().from(invoices).where(eq(invoices.clientId, clientId)).orderBy(desc(invoices.periodStart));
  const pays = inv.length ? await ctx.db.select().from(payments).where(inArray(payments.invoiceId, inv.map((i) => i.id))).orderBy(desc(payments.submittedAt)) : [];
  return inv.map((i) => ({ ...i, payments: pays.filter((p) => p.invoiceId === i.id) }));
}

/** Client (or staff for cash at the counter) submits a payment with a receipt photo (PAY-02). */
export async function submitPayment(ctx: Ctx, input: { invoiceId: string; method: PaymentMethod; reference?: string; receipt?: File | null }) {
  const [inv] = await ctx.db.select().from(invoices).where(eq(invoices.id, input.invoiceId));
  if (!inv) throw new ServiceError("That invoice was not found.");
  assertCanForClient(ctx.actor, inv.clientId, "payments.confirm", "payments.submitOwn");
  if (inv.status !== "issued") throw new ServiceError("This invoice is already paid or void.");
  if (input.method !== "cash" && !input.receipt) throw new ServiceError("Upload a photo of your Telebirr or CBE receipt.");
  const pending = await ctx.db.select().from(payments).where(and(eq(payments.invoiceId, inv.id), eq(payments.status, "submitted")));
  if (pending.length) throw new ServiceError("A receipt for this invoice is already waiting for confirmation.");
  const receiptKey = input.receipt ? await putImage("receipts", inv.clientId, input.receipt) : null;
  // the partial unique index allows one waiting receipt per invoice, so a double submit cannot create two
  const [row] = await ctx.db.insert(payments).values({
    invoiceId: inv.id, clientId: inv.clientId, amountBirr: inv.amountBirr, method: input.method,
    reference: input.reference?.trim() || null, receiptKey, status: "submitted", submittedAt: ctx.now, isDemo: inv.isDemo,
  }).onConflictDoNothing().returning();
  if (!row) throw new ServiceError("A receipt for this invoice is already waiting for confirmation.");
  const staff = await userIdsWithRoles(ctx.db, ["operations"]);
  await notify(ctx.db, { userIds: staff, kind: "payment.submitted", title: "Receipt to confirm",
    body: `${formatBirr(inv.amountBirr)} by ${input.method}`, link: "/staff/payments", dedupeKey: `payment-submitted:${row.id}` });
  return row;
}

/** The ops confirmation queue (PAY-03). */
export async function paymentQueue(ctx: Ctx) {
  assertCan(ctx.actor, "payments.confirm");
  return ctx.db.select({ payment: payments, invoice: invoices, client: { id: clients.id, firstName: clients.firstName, lastName: clients.lastName, phone: clients.phone } })
    .from(payments).innerJoin(invoices, eq(invoices.id, payments.invoiceId)).innerJoin(clients, eq(clients.id, payments.clientId))
    .where(eq(payments.status, "submitted")).orderBy(asc(payments.submittedAt));
}

/** One tap: confirm a submitted payment; marks the invoice paid, activates a pending subscription (PAY-04). */
export async function confirmPayment(ctx: Ctx, paymentId: string) {
  assertCan(ctx.actor, "payments.confirm");
  return ctx.db.transaction(async (tx) => {
    const [p] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!p) throw new ServiceError("That payment was not found.");
    if (p.status !== "submitted") throw new ServiceError("This payment was already handled.");
    const [inv] = await tx.select().from(invoices).where(eq(invoices.id, p.invoiceId)).for("update");
    if (inv.status === "paid") throw new ServiceError("This invoice is already paid. Reject this receipt (it is a duplicate) so nothing is counted twice.");
    if (inv.status === "void") throw new ServiceError("This invoice was cancelled (for example the week was paused). Reject the receipt instead; the client has nothing to pay for it.");
    await tx.update(payments).set({ status: "confirmed", confirmedByUserId: actorUserId(ctx.actor), confirmedAt: ctx.now }).where(eq(payments.id, p.id));
    const [paid] = await tx.select({ n: sql<number>`coalesce(sum(${payments.amountBirr}), 0)::int` }).from(payments)
      .where(and(eq(payments.invoiceId, inv.id), eq(payments.status, "confirmed")));
    if ((paid?.n ?? 0) >= inv.amountBirr && inv.status === "issued") await tx.update(invoices).set({ status: "paid" }).where(eq(invoices.id, inv.id));
    const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, inv.subscriptionId));
    if (sub?.status === "pending_payment") {
      await tx.update(subscriptions).set({ status: "active" }).where(eq(subscriptions.id, sub.id));
      await tx.update(clients).set({ status: "active" }).where(and(eq(clients.id, sub.clientId), inArray(clients.status, ["lead", "ended"])));
    }
    await writeAudit(tx, ctx.actor, { action: "payment.confirm", entity: "payments", entityId: p.id,
      before: { status: p.status }, after: { status: "confirmed", invoiceId: inv.id, amountBirr: p.amountBirr } });
    const [c] = await tx.select({ userId: clients.userId }).from(clients).where(eq(clients.id, p.clientId));
    if (c?.userId) await notify(tx, { userIds: [c.userId], kind: "payment.confirmed", title: "Payment confirmed",
      body: `${formatBirr(p.amountBirr)} received. Thank you!`, link: "/app/payments", dedupeKey: `payment-confirmed:${p.id}` });
    return { invoicePaid: (paid?.n ?? 0) >= inv.amountBirr };
  });
}

export async function rejectPayment(ctx: Ctx, paymentId: string, reason: string) {
  assertCan(ctx.actor, "payments.confirm");
  if (!reason.trim()) throw new ServiceError("Say why the receipt was rejected so the client can fix it.");
  const [p] = await ctx.db.update(payments)
    .set({ status: "rejected", rejectionReason: reason.trim(), confirmedByUserId: actorUserId(ctx.actor), confirmedAt: ctx.now })
    .where(and(eq(payments.id, paymentId), eq(payments.status, "submitted"))).returning();
  if (!p) throw new ServiceError("This payment was already handled.");
  await writeAudit(ctx.db, ctx.actor, { action: "payment.reject", entity: "payments", entityId: p.id, before: { status: "submitted" }, after: { status: "rejected" }, reason });
  const [c] = await ctx.db.select({ userId: clients.userId }).from(clients).where(eq(clients.id, p.clientId));
  if (c?.userId) await notify(ctx.db, { userIds: [c.userId], kind: "payment.rejected", title: "Receipt not accepted",
    body: reason.trim(), link: "/app/payments", dedupeKey: `payment-rejected:${p.id}` });
}

/** Signed URL for a receipt, after checking the viewer may see it (SEC-08). */
export async function receiptUrl(ctx: Ctx, key: string): Promise<string> {
  const parsed = parseKey(key);
  if (!parsed || parsed.prefix !== "receipts") throw new ForbiddenError();
  assertCanForClient(ctx.actor, parsed.ownerId, "payments.confirm", "invoices.readOwn");
  return storage().signedUrl(key, 300);
}

/** Issued invoices due at or before an instant (for reminders). */
export async function unpaidInvoicesDueBy(db: DbOrTx, dueBy: Date) {
  return db.select({ invoice: invoices, userId: clients.userId, firstName: clients.firstName }).from(invoices)
    .innerJoin(clients, eq(clients.id, invoices.clientId))
    .where(and(eq(invoices.status, "issued"), lte(invoices.dueAt, dueBy)));
}
