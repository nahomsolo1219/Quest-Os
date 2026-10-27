// Tour data for the demo copy (DEMO_MODE=true): on top of the demo seed, makes every staff tour step point at
// something real for TODAY (Africa/Addis_Ababa). Everything goes through the real services and jobs where they
// exist (locks, morning drops, rider actions, receipts, swaps, community, notifications); the few rows written
// directly (quick-start plans while ingredient prices are empty) mirror createSubscription. All rows are demo rows:
// removeDemo deletes them. Only call right after a fresh demo seed (seedAll does), it is not idempotent.
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "../client";
import * as s from "../schema";
import { createStaffUser } from "../../src/server/auth";
import { loadActor, type Actor, type Role } from "../../src/server/authz";
import { runJob } from "../../src/server/jobs";
import { confirmPayment, generateInvoicesForSubscription } from "../../src/server/services/billing";
import { uploadReceipt, requestSwap } from "../../src/server/services/client-app";
import { createLead } from "../../src/server/services/clients";
import { addComment, checkInChallenge, createPost, report } from "../../src/server/services/community";
import { assignRider, markDelivered, markFailed } from "../../src/server/services/delivery";
import { notify, userIdsWithRoles } from "../../src/server/services/notifications";
import { quickStartsTakenByDate } from "../../src/server/services/orders";
import { loadSettings } from "../../src/server/services/settings";
import { signUp, type SignUpInput } from "../../src/server/services/signup";
import { priceLockedUntil, quickStartAmount } from "../../src/domain/pricing";
import { isServiceDay, nextLockableWeek, quickStartPlan, weekLockedAt, weeklyCutoff } from "../../src/domain/schedule";
import { subscriptionEndDate } from "../../src/domain/subscriptions";
import { addDays, addisDate, addisInstant, weekStartOf } from "../../src/domain/time";
import { DEMO_CLIENT_PASSWORD, DEMO_PRICE_MONTH, DEMO_STAFF_PASSWORD, demoPhone } from "./demo";
import { makePng } from "./png";

/** A coach-only account (the base demo staff's coaches are also owners). Created by the tour data only. */
export const DEMO_COACH = { name: "Selam Tesfaye", email: "coach@questmeals.demo", roles: ["coach"] as Role[] };

export type DemoTryRole = {
  /** button text */
  label: string;
  role: Role;
  /** what to sign in with: an email for staff, an E.164 phone for clients */
  login: string;
  kind: "email" | "phone";
  /** phone as the client types it after the +251 prefix (9XXXXXXXX); null for staff */
  localPhone: string | null;
  password: string;
  description: string;
};

/** The one-tap "Try a role" accounts on the demo login page. */
export const DEMO_TRY_ROLES: DemoTryRole[] = [
  { label: "Owner", role: "owner", login: "fahim@questmeals.demo", kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Fahim: dashboard, payments, settings, partners" },
  { label: "Operations", role: "operations", login: "nebiyou@questmeals.demo", kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Nebiyou: today's to-do, clients, payments, orders, delivery" },
  { label: "Nutritionist", role: "nutritionist", login: "nutritionist@questmeals.demo", kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Hana: sizes, check-ins, swap approvals" },
  { label: "Kitchen", role: "kitchen", login: "kitchen@questmeals.demo", kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Meron: production sheet, recipes, packing, labels" },
  { label: "Rider", role: "delivery", login: "rider@questmeals.demo", kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Yonas: today's drops, delivered or failed" },
  { label: "Coach", role: "coach", login: DEMO_COACH.email, kind: "email", localPhone: null, password: DEMO_STAFF_PASSWORD, description: "Selam: community feed, challenges, reports" },
  { label: "Client (delivery)", role: "client", login: demoPhone(0), kind: "phone", localPhone: demoPhone(0).slice(4), password: DEMO_CLIENT_PASSWORD, description: "Abel: Performance plan, daily delivery" },
  { label: "Client (pick-up)", role: "client", login: demoPhone(1), kind: "phone", localPhone: demoPhone(1).slice(4), password: DEMO_CLIENT_PASSWORD, description: "Sara: Essential plan, picks up at the cafe" },
];

export type TourSummary = {
  lockedWeeks: string[];
  sceneDate: string;
  drops: { delivered: number; failed: number; pending: number; assigned: number; unassigned: number; pickup: number };
  receiptsWaiting: number;
  quickStarts: number;
  swapRequests: number;
  checkinsMadeDue: number;
  posts: number;
  reports: number;
  leadsAdded: number;
  notificationsSent: number;
};

const HOUR = 3600_000;

/**
 * Adds the tour data for `today` (Addis date) as of `now` (an instant on that date). Weekday behaviour:
 * - the current week is always locked by the real Thursday lock; once this week's Thursday 18:00 cutoff has passed
 *   (Thu evening to Sun) next week is paid (all weekly clients but Natnael, who is skipped for non-payment) and
 *   locked too, so the kitchen always has the next cook day;
 * - drop states are set on today when it is a service day, otherwise (Sunday) on the last service day (Saturday);
 * - receipts and unpaid invoices are for the week decided at the coming cutoff.
 */
export async function seedTourData(db: DbOrTx, opts: { today: string; now: Date }): Promise<TourSummary> {
  const { today, now } = opts;
  if (addisDate(now) !== today) throw new Error(`tour data: now (${now.toISOString()}) is not on ${today} in Addis Ababa`);
  const settings = await loadSettings(db);
  const sch = settings.schedule;

  // --- people
  await createStaffUser(db, { ...DEMO_COACH, password: DEMO_STAFF_PASSWORD, isDemo: true });
  const staffActor = async (email: string): Promise<Actor> => {
    const [u] = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, email));
    if (!u) throw new Error(`tour data: no user ${email}`);
    return (await loadActor(db, u.id))!;
  };
  const clientRows = await db.select().from(s.clients).where(eq(s.clients.isDemo, true));
  const clientNo = (i: number) => {
    const c = clientRows.find((r) => r.phone === demoPhone(i));
    if (!c) throw new Error(`tour data: no demo client ${demoPhone(i)}`);
    return c;
  };
  const clientActor = async (i: number) => (await loadActor(db, clientNo(i).userId!))!;
  const ops = await staffActor("nebiyou@questmeals.demo");
  const rider = await staffActor("rider@questmeals.demo");
  const coach = await staffActor(DEMO_COACH.email);
  const ABEL = 0, SARA = 1, YARED = 2, LIYA = 3, MIKIAS = 4, BETHLEHEM = 5, NATNAEL = 6, HIWOT = 7, SAMUEL = 8;
  const png = () => new File([new Uint8Array(makePng(120, 160))], "receipt.png", { type: "image/png" });

  // --- locks: the current week (Thursday before it), and next week once this week's cutoff has passed
  const thisWeek = weekStartOf(today);
  const lockedWeeks: string[] = [];
  await runJob(db, "thursday-lock", new Date(weeklyCutoff(thisWeek, sch).getTime() + 5000));
  lockedWeeks.push(thisWeek);
  const nextWeek = addDays(thisWeek, 7);
  const nextCutoff = weeklyCutoff(nextWeek, sch);
  if (nextCutoff.getTime() <= now.getTime()) {
    // the weekly clients paid next week before Thursday's cutoff (Natnael did not: the lock skips him)
    for (const [k, i] of [ABEL, SARA, MIKIAS, HIWOT, SAMUEL].entries()) {
      const inv = await issuedWeekly(db, clientNo(i).id, nextWeek);
      if (!inv) continue;
      const at = new Date(nextCutoff.getTime() - 30 * HOUR + k * 600_000);
      const pay = await uploadReceipt({ db, actor: await clientActor(i), now: at },
        { invoiceId: inv.id, method: k % 2 ? "cbe" : "telebirr", reference: `${k % 2 ? "FT" : "TB"}DEMO${nextWeek.replace(/-/g, "")}${k}`, receipt: png() });
      await confirmPayment({ db, actor: ops, now: new Date(nextCutoff.getTime() - 6 * HOUR + k * 600_000) }, pay.id);
    }
    await runJob(db, "thursday-lock", new Date(nextCutoff.getTime() + 5000));
    lockedWeeks.push(nextWeek);
  }

  // --- drops: the morning job for today, and the delivery scene on today (or the last service day)
  await runJob(db, "daily-morning", addisInstant(today, "06:00"));
  let sceneDate = today;
  for (let i = 0; i < 7 && !isServiceDay(sceneDate, sch); i++) sceneDate = addDays(sceneDate, -1);
  if (sceneDate !== today) await runJob(db, "daily-morning", addisInstant(sceneDate, "06:00"));
  const at = (hhmm: string) => addisInstant(sceneDate, hhmm);
  const sceneDrops = await db.select({ d: s.deliveryDrops, first: s.clients.firstName }).from(s.deliveryDrops)
    .innerJoin(s.clients, eq(s.clients.id, s.deliveryDrops.clientId))
    .where(eq(s.deliveryDrops.dropDate, sceneDate)).orderBy(asc(s.deliveryDrops.routePosition), asc(s.clients.firstName));
  const deliveries = sceneDrops.filter((x) => x.d.kind === "delivery").map((x) => x.d);
  const pickups = sceneDrops.filter((x) => x.d.kind === "pickup").map((x) => x.d);
  // two thirds of the route to Yonas (the rest stays unassigned for operations to hand out)
  const assigned = deliveries.slice(0, Math.max(1, Math.ceil((deliveries.length * 2) / 3)));
  if (assigned.length) await assignRider({ db, actor: ops, now: at("06:20") }, assigned.map((d) => d.id), rider.userId);
  if (assigned[0]) await markDelivered({ db, actor: rider, now: at("07:45") }, assigned[0].id);
  if (assigned[1]) await markFailed({ db, actor: rider, now: at("08:20") }, assigned[1].id, "Not home");
  if (pickups.length > 1) await markDelivered({ db, actor: ops, now: at("08:05") }, pickups[0].id);

  // --- payments: receipts waiting for the week decided at the coming cutoff; the others stay unpaid
  const comingWeek = nextLockableWeek(now, sch);
  let receiptsWaiting = 0;
  for (const [k, [i, method, ref]] of ([[SARA, "telebirr", "TB"], [HIWOT, "telebirr", "TB"], [MIKIAS, "cbe", "FT"]] as const).entries()) {
    const inv = await issuedWeekly(db, clientNo(i).id, comingWeek);
    if (!inv) continue;
    await uploadReceipt({ db, actor: await clientActor(i), now: new Date(now.getTime() - (5 - k) * HOUR) },
      { invoiceId: inv.id, method, reference: `${ref}${comingWeek.replace(/-/g, "")}${70 + k}`, receipt: png() });
    receiptsWaiting++;
  }

  // --- quick starts (signed up last night): one with a receipt waiting, one paid and waiting for the 18:00 lock
  const signupAt = new Date(now.getTime() - 2 * HOUR);
  await demoQuickStart(db, signupAt, {
    firstName: "Meseret", lastName: "Alemu", phone: demoPhone(10), sex: "female", age: 28, weightKg: 66, heightCm: 164, activity: "moderate",
    goal: "lean", allergies: [], dislikes: ["liver"], address: "Bole Medhanialem, behind the church", area: "Bole", landmark: "Blue gate",
    deliveryOption: "daily",
  }, "receipt", ops);
  await demoQuickStart(db, new Date(signupAt.getTime() + 15 * 60_000), {
    firstName: "Dawit", lastName: "Mengistu", phone: demoPhone(11), sex: "male", age: 34, weightKg: 81, heightCm: 177, activity: "light",
    goal: "lean", allergies: [], dislikes: [], address: "", area: null, landmark: "", deliveryOption: "pickup",
  }, "paid", ops);

  // --- swap requests for the nutritionist (custom requests outside the swap table)
  let swapRequests = 0;
  for (const [i, text] of [
    [YARED, "I don't eat fish. Could the fish dinner be chicken instead?"],
    [LIYA, "On training days could I have injera instead of rice at lunch?"],
  ] as const) {
    await requestSwap({ db, actor: await clientActor(i), now: new Date(now.getTime() - (4 - swapRequests) * HOUR) }, { customRequest: text });
    swapRequests++;
  }

  // --- check-ins due: three clients' last check-in moves to 15 days ago (the 14-day rule of checkinList)
  const due = [LIYA, MIKIAS, BETHLEHEM].map((i) => clientNo(i).id);
  const old = await db.select().from(s.checkins).where(inArray(s.checkins.clientId, due));
  for (const c of old) await db.update(s.checkins).set({ checkinDate: addDays(c.checkinDate, -15) }).where(eq(s.checkins.id, c.id));

  // --- community: a coach tip, a client progress post and question, a client comment, an off-topic post reported
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  let posts = 0;
  await createPost({ db, actor: coach, now: ago(20) }, { type: "post", body: "Coach tip: drink a full glass of water before each meal and keep your snack for the afternoon slump. Small habits, big weeks." });
  posts++;
  await createPost({ db, actor: await clientActor(YARED), now: ago(9) }, { type: "progress", shareProgress: true, body: "Three weeks of the Premium plan. Gym numbers are up and I am finally eating enough." });
  posts++;
  await createPost({ db, actor: await clientActor(LIYA), now: ago(6) }, { type: "question", body: "Is it OK to train fasted before breakfast, or should I eat the pancakes first?" });
  posts++;
  const [abelPost] = await db.select({ id: s.communityPosts.id }).from(s.communityPosts)
    .where(and(eq(s.communityPosts.authorUserId, clientNo(ABEL).userId!), eq(s.communityPosts.type, "progress"))).limit(1);
  if (abelPost) await addComment({ db, actor: await clientActor(LIYA), now: ago(5) }, { postId: abelPost.id, body: "Well done Abel! Those pancakes are my favourite too." });
  const spam = await createPost({ db, actor: await clientActor(MIKIAS), now: ago(4) }, { type: "post", body: "Selling imported protein powder, half price this week. Message me on Telegram." });
  posts++;
  await report({ db, actor: await clientActor(SARA), now: ago(3) }, { targetType: "post", targetId: spam.id, reason: "Selling things in the community." });
  const [challenge] = await db.select({ id: s.challenges.id }).from(s.challenges).where(and(eq(s.challenges.startsOn, thisWeek))).limit(1);
  if (challenge) for (const i of [ABEL, LIYA, NATNAEL]) await checkInChallenge({ db, actor: await clientActor(i), now: ago(1) }, challenge.id);

  // --- a new lead to call
  const lead = await createLead({ db, actor: ops, now: ago(1) }, {
    firstName: "Tigist", lastName: "Bekele", phone: demoPhone(12), source: "walk_in", notes: "Walked in at the cafe; asked about Performance with delivery to Bole.",
  });
  await db.update(s.clients).set({ isDemo: true }).where(eq(s.clients.id, lead.id));

  // --- a few unread notes for the roles that got none from the steps above
  let notificationsSent = 0;
  notificationsSent += await notify(db, { userIds: await userIdsWithRoles(db, ["owner"]), kind: "ops.payments_waiting", title: `${receiptsWaiting + 1} receipts waiting`,
    body: "Receipts for next week are waiting for confirmation.", link: "/staff/payments", dedupeKey: `demo-owner-receipts:${today}`, telegram: "none" });
  // (reports go to owners and operations: coaches do not hold community.moderate)
  notificationsSent += await notify(db, { userIds: await userIdsWithRoles(db, ["coach"]), kind: "community.progress", title: "Yared shared his progress",
    body: "Cheer him on in the community feed.", link: "/staff/community", dedupeKey: `demo-coach-progress:${today}`, telegram: "none" });
  notificationsSent += await notify(db, { userIds: await userIdsWithRoles(db, ["coach"]), kind: "community.question", title: "New question for the coaches",
    body: "Liya asked about training before breakfast.", link: "/staff/community", dedupeKey: `demo-coach-question:${today}`, telegram: "none" });

  const sceneNow = await db.select().from(s.deliveryDrops).where(eq(s.deliveryDrops.dropDate, sceneDate));
  const del = sceneNow.filter((d) => d.kind === "delivery");
  return {
    lockedWeeks, sceneDate,
    drops: {
      delivered: sceneNow.filter((d) => d.status === "delivered").length, failed: sceneNow.filter((d) => d.status === "failed").length,
      pending: sceneNow.filter((d) => d.status === "pending").length, assigned: del.filter((d) => d.riderUserId).length,
      unassigned: del.filter((d) => !d.riderUserId).length, pickup: sceneNow.filter((d) => d.kind === "pickup").length,
    },
    receiptsWaiting, quickStarts: 2, swapRequests, checkinsMadeDue: due.length, posts, reports: 1, leadsAdded: 1, notificationsSent,
  };
}

async function issuedWeekly(db: DbOrTx, clientId: string, periodStart: string) {
  const [inv] = await db.select().from(s.invoices)
    .where(and(eq(s.invoices.clientId, clientId), eq(s.invoices.periodStart, periodStart), eq(s.invoices.status, "issued")));
  return inv ?? null;
}

type QuickStartPerson = Omit<SignUpInput, "password" | "plan" | "areaId" | "source"> & { area: string | null };

/**
 * A public quick-start sign-up: the real signUp (client, login, provisional size), then the plan and its first invoice
 * as createSubscription writes them (it cannot quote while ingredient prices are empty, so the demo price is used),
 * then the receipt upload; "paid" also has operations confirm it.
 */
async function demoQuickStart(db: DbOrTx, at: Date, p: QuickStartPerson, pay: "receipt" | "paid", ops: Actor) {
  const settings = await loadSettings(db);
  const [area] = p.area ? await db.select({ id: s.areas.id }).from(s.areas).where(eq(s.areas.name, p.area)) : [];
  const { area: _area, ...person } = p;
  void _area;
  const res = await signUp({ db, actor: null, now: at }, { ...person, areaId: area?.id ?? null, password: DEMO_CLIENT_PASSWORD, plan: null, source: "instagram" });
  await db.update(s.user).set({ isDemo: true }).where(eq(s.user.id, res.userId));
  await db.update(s.clients).set({ isDemo: true }).where(eq(s.clients.id, res.clientId));

  const [pkg] = await db.select().from(s.packages).where(eq(s.packages.code, "essential"));
  const [np] = await db.select().from(s.nutritionProfiles).where(and(eq(s.nutritionProfiles.clientId, res.clientId), eq(s.nutritionProfiles.isCurrent, true)));
  const plan = quickStartPlan(at, settings.schedule, await quickStartsTakenByDate(db, addisDate(at)));
  if (!plan) throw new Error("tour data: no quick-start capacity");
  const priceMonth = p.deliveryOption === "pickup" ? DEMO_PRICE_MONTH.pickup : DEMO_PRICE_MONTH.daily;
  const priceDay = Math.round(priceMonth / 26);
  const [sub] = await db.insert(s.subscriptions).values({
    clientId: res.clientId, packageId: pkg.id, goal: np.goal, deliveryOption: p.deliveryOption, billingPeriod: "weekly",
    startDate: plan.startDate, endDate: subscriptionEndDate(plan.startDate, 1), termMonths: 1,
    priceDayBirr: priceDay, priceMonthBirr: priceMonth, planPriceBirr: priceMonth,
    priceBreakdown: { demo: true, priceDay, note: "Demo price: ingredient prices are not set yet." },
    priceLockedUntil: priceLockedUntil(plan.startDate, settings.pricing.priceLockMonths),
    status: "pending_payment", isQuickStart: true, quickStartPeriodEnd: plan.periodEnd, isDemo: true,
  }).returning();
  const [inv] = await db.insert(s.invoices).values({
    clientId: res.clientId, subscriptionId: sub.id, kind: "quick_start", periodStart: plan.startDate, periodEnd: plan.periodEnd,
    serviceDays: plan.serviceDays, amountBirr: quickStartAmount(priceDay, plan.serviceDays, settings.pricing), status: "issued", dueAt: plan.lockAt, isDemo: true,
  }).returning();
  await generateInvoicesForSubscription(db, sub.id, weekLockedAt(at, settings.schedule));

  const actor = (await loadActor(db, res.userId))!;
  const payment = await uploadReceipt({ db, actor, now: new Date(at.getTime() + 20 * 60_000) },
    { invoiceId: inv.id, method: "telebirr", reference: `TBQS${p.phone.slice(-4)}`, receipt: new File([new Uint8Array(makePng(120, 160))], "receipt.png", { type: "image/png" }) });
  if (pay === "paid") await confirmPayment({ db, actor: ops, now: new Date(at.getTime() + 50 * 60_000) }, payment.id);
  return { clientId: res.clientId, subscriptionId: sub.id, invoiceId: inv.id };
}
