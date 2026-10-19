// Demo data (every row is_demo = true where the column exists). Removed with removeDemo / npm run db:remove-demo.
// Weekly orders and order days are NOT created here: they come from the lock service.
import { eq, inArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "../client";
import * as s from "../schema";
import { createClientUser, createStaffUser, type Auth } from "../../src/server/auth";
import { DEFAULT_NUTRITION } from "../../src/domain/settings";
import type {
  Activity, BillingPeriod, DeliveryOption, Goal, PackageCode, PaymentMethod, Role, Sex, Size,
} from "../../src/domain/types";
import { addDays, addMonths, addisInstant, addisToday, datesInRange, isoWeekday, weekStartOf } from "./dates";
import { seedReference } from "./reference";

export const DEMO_STAFF_PASSWORD = "QuestDemo2026!";
export const DEMO_CLIENT_PASSWORD = "Client2026!";

export const DEMO_STAFF: { name: string; email: string; roles: Role[] }[] = [
  { name: "Dagi Bekele", email: "dagi@questmeals.demo", roles: ["owner", "coach"] },
  { name: "Kidus Alemu", email: "kidus@questmeals.demo", roles: ["owner", "coach"] },
  { name: "Fahim Mohammed", email: "fahim@questmeals.demo", roles: ["owner"] },
  { name: "Nebiyou Tadesse", email: "nebiyou@questmeals.demo", roles: ["operations", "delivery"] },
  { name: "Hana Girma", email: "nutritionist@questmeals.demo", roles: ["nutritionist"] },
  { name: "Meron Abebe", email: "kitchen@questmeals.demo", roles: ["kitchen"] },
  { name: "Yonas Haile", email: "rider@questmeals.demo", roles: ["delivery"] },
];

type DemoClient = {
  first: string; last: string; sex: Sex; age: number; weightKg: number; heightCm: number; activity: Activity; goal: Goal;
  pkg: PackageCode; delivery: DeliveryOption; billing: BillingPeriod; area: string; address: string; landmark: string;
  checkInWeekday: number; status: "active" | "paused" | "lead"; allergies?: string[]; dislikes?: string[];
  leadSource: "instagram" | "referral" | "walk_in" | "other";
};

/** phones +251911000001 … +251911000010 in this order */
export const DEMO_CLIENTS: DemoClient[] = [
  { first: "Abel", last: "Tesfaye", sex: "male", age: 29, weightKg: 92, heightCm: 180, activity: "moderate", goal: "lean", pkg: "performance", delivery: "daily", billing: "weekly", area: "Bole", address: "Bole Road, house 214", landmark: "Behind Edna Mall", checkInWeekday: 1, status: "active", leadSource: "instagram" },
  { first: "Sara", last: "Mekonnen", sex: "female", age: 31, weightKg: 68, heightCm: 165, activity: "light", goal: "lean", pkg: "essential", delivery: "pickup", billing: "weekly", area: "Kazanchis", address: "Kazanchis, Elilly area", landmark: "Near Intercontinental", checkInWeekday: 2, status: "active", allergies: ["peanut"], leadSource: "referral" },
  { first: "Yared", last: "Getachew", sex: "male", age: 24, weightKg: 72, heightCm: 178, activity: "very_active", goal: "build", pkg: "premium", delivery: "daily", billing: "monthly", area: "CMC", address: "CMC, Michael condominium block 12", landmark: "Opposite St. Michael church", checkInWeekday: 3, status: "active", dislikes: ["fish"], leadSource: "instagram" },
  { first: "Liya", last: "Haile", sex: "female", age: 27, weightKg: 56, heightCm: 162, activity: "moderate", goal: "build", pkg: "performance", delivery: "daily", billing: "monthly", area: "Sarbet", address: "Sarbet, Canada Embassy road", landmark: "Next to Sarbet pharmacy", checkInWeekday: 4, status: "active", leadSource: "walk_in" },
  { first: "Mikias", last: "Alemayehu", sex: "male", age: 36, weightKg: 104, heightCm: 176, activity: "sedentary", goal: "lean", pkg: "essential", delivery: "daily", billing: "weekly", area: "Megenagna", address: "Megenagna, Zefmesh mall area", landmark: "Behind Zefmesh", checkInWeekday: 5, status: "active", dislikes: ["beans"], leadSource: "referral" },
  { first: "Bethlehem", last: "Tadesse", sex: "female", age: 40, weightKg: 78, heightCm: 160, activity: "light", goal: "lean", pkg: "premium", delivery: "daily", billing: "monthly", area: "Old Airport", address: "Old Airport, Lideta Pharmacy road", landmark: "Near the Old Airport roundabout", checkInWeekday: 1, status: "active", leadSource: "instagram" },
  { first: "Natnael", last: "Worku", sex: "male", age: 30, weightKg: 84, heightCm: 184, activity: "athlete", goal: "build", pkg: "performance", delivery: "daily", billing: "weekly", area: "Ayat", address: "Ayat, Real estate site 3", landmark: "Ayat roundabout", checkInWeekday: 2, status: "active", leadSource: "other" },
  { first: "Hiwot", last: "Desta", sex: "female", age: 23, weightKg: 63, heightCm: 168, activity: "moderate", goal: "lean", pkg: "essential", delivery: "pickup", billing: "weekly", area: "Piassa", address: "Piassa, Arada building", landmark: "Near Taitu Hotel", checkInWeekday: 6, status: "active", leadSource: "instagram" },
  { first: "Samuel", last: "Kebede", sex: "male", age: 33, weightKg: 88, heightCm: 175, activity: "moderate", goal: "lean", pkg: "performance", delivery: "daily", billing: "weekly", area: "Bole", address: "Bole Atlas, house 77", landmark: "Behind Atlas Hotel", checkInWeekday: 3, status: "paused", leadSource: "referral" },
  { first: "Rahel", last: "Assefa", sex: "female", age: 26, weightKg: 70, heightCm: 167, activity: "light", goal: "lean", pkg: "essential", delivery: "pickup", billing: "weekly", area: "Kazanchis", address: "Kazanchis", landmark: "", checkInWeekday: 1, status: "lead", leadSource: "instagram" },
];

export const demoPhone = (i: number) => `+2519110000${String(i + 1).padStart(2, "0")}`;

/** Demo prices: real ingredient prices are empty in the seed, so the pricing formula cannot run yet (DECISIONS). */
export const DEMO_PRICE_MONTH = { daily: 58400, pickup: 54100 } as const;

const round10 = (n: number) => Math.round(n / 10) * 10;

function demoNutrition(c: DemoClient) {
  const n = DEFAULT_NUTRITION;
  const bmr = Math.round(10 * c.weightKg + 6.25 * c.heightCm - 5 * c.age + (c.sex === "male" ? 5 : -161));
  const tdee = Math.round(bmr * n.activityFactors[c.activity]);
  const kcal = Math.round(tdee * n.goalFactors[c.goal]);
  const size = (Object.entries(n.sizeKcal) as [Size, number][]).reduce((best, cur) =>
    Math.abs(cur[1] - kcal) < Math.abs(best[1] - kcal) ? cur : best,
  )[0];
  const sizeKcal = n.sizeKcal[size];
  const split = n.macroSplit[c.goal];
  const macros = (k: number) => ({
    p: Math.round((k * split.protein) / n.kcalPerGram.protein),
    c: Math.round((k * split.carb) / n.kcalPerGram.carb),
    f: Math.round((k * split.fat) / n.kcalPerGram.fat),
  });
  const m = macros(sizeKcal);
  return { bmr, tdee, kcal, size, sizeKcal, m };
}

export type DemoSummary = { staff: number; clients: number; subscriptions: number; invoices: number; payments: number; checkins: number; skipped?: boolean };

export async function seedDemo(db: DbOrTx, opts: { today?: string; auth?: Auth } = {}): Promise<DemoSummary> {
  const today = opts.today ?? addisToday();
  const existing = await db.select({ id: s.user.id }).from(s.user).where(eq(s.user.email, DEMO_STAFF[0].email));
  if (existing.length > 0) {
    return { staff: 0, clients: 0, subscriptions: 0, invoices: 0, payments: 0, checkins: 0, skipped: true };
  }
  const ref = await seedReference(db);

  // staff
  const staffIds = new Map<string, string>();
  for (const st of DEMO_STAFF) {
    const u = await createStaffUser(db, { ...st, password: DEMO_STAFF_PASSWORD, isDemo: true }, opts.auth);
    staffIds.set(st.email, u.id);
  }
  const dagi = staffIds.get("dagi@questmeals.demo")!;
  const kidus = staffIds.get("kidus@questmeals.demo")!;
  const fahim = staffIds.get("fahim@questmeals.demo")!;
  const nebiyou = staffIds.get("nebiyou@questmeals.demo")!;
  const hana = staffIds.get("nutritionist@questmeals.demo")!;

  const thisWeek = weekStartOf(today);
  const startDate = addDays(thisWeek, -7);
  const methods: PaymentMethod[] = ["telebirr", "cbe", "cash"];
  let subscriptionsN = 0, invoicesN = 0, paymentsN = 0, checkinsN = 0, payIdx = 0;
  const clientUserIds: string[] = [];

  for (const [i, c] of DEMO_CLIENTS.entries()) {
    const phone = demoPhone(i);
    let userId: string | null = null;
    if (c.status !== "lead") {
      const u = await createClientUser(db, { name: `${c.first} ${c.last}`, phone, password: DEMO_CLIENT_PASSWORD, isDemo: true }, opts.auth);
      userId = u.id;
      clientUserIds.push(u.id);
    }
    const [client] = await db
      .insert(s.clients)
      .values({
        userId,
        firstName: c.first,
        lastName: c.last,
        phone,
        status: c.status,
        leadSource: c.leadSource,
        leadNotes: c.status === "lead" ? "Asked about the Essential plan on Instagram; wants pick-up." : null,
        sex: c.sex,
        age: c.age,
        weightG: c.weightKg * 1000,
        heightCm: c.heightCm,
        activity: c.activity,
        goal: c.goal,
        allergies: c.allergies ?? [],
        dislikes: c.dislikes ?? [],
        address: c.address,
        areaId: ref.areaByName.get(c.area) ?? null,
        landmark: c.landmark || null,
        checkInWeekday: c.checkInWeekday,
        isDemo: true,
      })
      .returning({ id: s.clients.id });
    if (c.status === "lead") continue;

    // consultation + nutrition profile set by the nutritionist
    const consultDate = addDays(startDate, -4);
    await db.insert(s.consultations).values({
      clientId: client.id, heldAt: addisInstant(consultDate, "10:00"), mode: i % 2 === 0 ? "in_person" : "phone",
      notes: "Intake consult: goals, food preferences and schedule.", byUserId: hana,
    });
    const nut = demoNutrition(c);
    await db.insert(s.nutritionProfiles).values({
      clientId: client.id, bmr: nut.bmr, tdee: nut.tdee, suggestedKcal: nut.kcal, suggestedSize: nut.size,
      suggestedProteinG: nut.m.p, suggestedCarbG: nut.m.c, suggestedFatG: nut.m.f,
      kcalTarget: nut.sizeKcal, size: nut.size, goal: c.goal, proteinG: nut.m.p, carbG: nut.m.c, fatG: nut.m.f,
      isOverride: false, provisional: false, setByUserId: hana, setAt: addisInstant(addDays(startDate, -3), "11:00"), isCurrent: true,
    });

    // subscription
    const priceMonth = c.delivery === "pickup" ? DEMO_PRICE_MONTH.pickup : DEMO_PRICE_MONTH.daily;
    const paused = c.status === "paused";
    const baseEnd = addDays(addMonths(startDate, 1), -1);
    const [sub] = await db
      .insert(s.subscriptions)
      .values({
        clientId: client.id, packageId: ref.packageByCode.get(c.pkg)!, goal: c.goal, deliveryOption: c.delivery,
        billingPeriod: c.billing, startDate, endDate: paused ? addDays(baseEnd, 7) : baseEnd, termMonths: 1,
        priceDayBirr: Math.round(priceMonth / 26), priceMonthBirr: priceMonth, planPriceBirr: priceMonth,
        priceBreakdown: { demo: true, note: "Demo price: ingredient prices are not set yet." },
        priceLockedUntil: addMonths(startDate, 4), status: paused ? "paused" : "active", isDemo: true,
      })
      .returning({ id: s.subscriptions.id });
    subscriptionsN++;
    if (paused) {
      await db.insert(s.pauses).values({ subscriptionId: sub.id, clientId: client.id, startWeek: thisWeek, weeks: 1, requestedByUserId: userId });
    }

    // invoices and payments
    const periods: { start: string; end: string; kind: "weekly" | "monthly"; paid: boolean }[] = [];
    if (c.billing === "weekly") {
      for (let w = startDate; w <= addDays(thisWeek, 7); w = addDays(w, 7)) {
        if (paused && w === thisWeek) continue; // paused week is not billed
        periods.push({ start: w, end: addDays(w, 6), kind: "weekly", paid: w <= thisWeek });
      }
    } else {
      periods.push({ start: startDate, end: baseEnd, kind: "monthly", paid: true });
    }
    for (const p of periods) {
      const serviceDays = datesInRange(p.start, p.end).filter((d) => isoWeekday(d) <= 6).length;
      const amount = p.kind === "monthly" ? priceMonth : round10((priceMonth * 6) / 26);
      // due at the cutoff before the period: Thursday 18:00 Addis of the previous week
      const dueAt = addisInstant(addDays(weekStartOf(p.start), -4), "18:00");
      const [inv] = await db
        .insert(s.invoices)
        .values({
          clientId: client.id, subscriptionId: sub.id, kind: p.kind, periodStart: p.start, periodEnd: p.end,
          serviceDays, amountBirr: amount, status: p.paid ? "paid" : "issued", dueAt, isDemo: true,
        })
        .returning({ id: s.invoices.id });
      invoicesN++;
      if (p.paid) {
        const method = methods[payIdx++ % methods.length];
        const submittedAt = new Date(dueAt.getTime() - 26 * 3600_000);
        await db.insert(s.payments).values({
          invoiceId: inv.id, clientId: client.id, amountBirr: amount, method,
          reference: method === "cash" ? null : `${method === "telebirr" ? "TB" : "FT"}${String(70000000 + payIdx * 7919)}`,
          status: "confirmed", submittedAt, confirmedByUserId: nebiyou, confirmedAt: new Date(submittedAt.getTime() + 2 * 3600_000),
          isDemo: true,
        });
        paymentsN++;
      }
    }

    // check-ins: weekly weights trending down for lean, up for build
    const trend = c.goal === "lean" ? [0, -600, -1100] : [0, 300, 600];
    for (const [k, delta] of trend.entries()) {
      if (paused && k === 2) continue;
      const date = addDays(today, -14 + 7 * k);
      await db.insert(s.checkins).values({
        clientId: client.id, checkinDate: date, weightG: c.weightKg * 1000 + delta, adherencePct: k === 0 ? null : 85 + ((i + k) % 3) * 5,
        notes: k === 0 ? "Baseline weight at consult." : null, byUserId: k === 0 ? hana : userId,
        source: k === 0 ? "nutritionist" : "client", isDemo: true,
      });
      checkinsN++;
    }
  }

  // community
  const [challenge] = await db
    .insert(s.challenges)
    .values({ title: "8,000 steps", question: "Did you hit 8,000 steps today?", startsOn: thisWeek, endsOn: addDays(thisWeek, 6), createdByUserId: dagi })
    .returning({ id: s.challenges.id });
  await db.insert(s.communityPosts).values([
    {
      authorUserId: dagi, type: "announcement", pinned: true, isDemo: true,
      body: "Welcome to the Quest community! Post your progress, ask Kidus and me anything, and join this week's 8,000 steps challenge.",
      challengeId: challenge.id,
    },
    {
      authorUserId: clientUserIds[0], type: "progress", isDemo: true, progress: { kgChange: -1.1, weeks: 2 },
      body: "Two weeks in. The pancakes are a game changer and the scale is moving.",
    },
  ]);

  // partner contributions
  await db.insert(s.partnerContributions).values([
    { partnerUserId: dagi, contributedOn: addDays(today, -30), type: "cash", amountBirr: 50000, note: "Starting capital for ingredients", createdBy: dagi, isDemo: true },
    { partnerUserId: kidus, contributedOn: addDays(today, -12), type: "time", hours: 12, note: "Community coaching and client onboarding", createdBy: dagi, isDemo: true },
    { partnerUserId: fahim, contributedOn: addDays(today, -20), type: "equipment", note: "Chest freezer for the kitchen", createdBy: fahim, isDemo: true },
  ]);

  return { staff: DEMO_STAFF.length, clients: DEMO_CLIENTS.length, subscriptions: subscriptionsN, invoices: invoicesN, payments: paymentsN, checkins: checkinsN };
}

/** Deletes every demo row and the rows that hang off demo users and clients. Reference data stays. */
export async function removeDemo(db: DbOrTx): Promise<Record<string, number>> {
  const run = async (tx: DbOrTx) => {
    const counts: Record<string, number> = {};
    const demoUsers = (await tx.select({ id: s.user.id }).from(s.user).where(eq(s.user.isDemo, true))).map((r) => r.id);
    const demoClients = (await tx.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.isDemo, true))).map((r) => r.id);
    const byUsers = <T>(col: T) => (demoUsers.length ? inArray(col as never, demoUsers) : sql`false`);
    const byClients = <T>(col: T) => (demoClients.length ? inArray(col as never, demoClients) : sql`false`);
    const n = (rows: unknown[]) => rows.length;

    counts.community_posts = n(await tx.delete(s.communityPosts).where(or(eq(s.communityPosts.isDemo, true), byUsers(s.communityPosts.authorUserId))).returning({ id: s.communityPosts.id }));
    counts.challenges = n(await tx.delete(s.challenges).where(byUsers(s.challenges.createdByUserId)).returning({ id: s.challenges.id }));
    counts.partner_contributions = n(await tx.delete(s.partnerContributions).where(or(eq(s.partnerContributions.isDemo, true), byUsers(s.partnerContributions.partnerUserId))).returning({ id: s.partnerContributions.id }));
    counts.purchases = n(await tx.delete(s.purchases).where(eq(s.purchases.isDemo, true)).returning({ id: s.purchases.id }));
    counts.stock_counts = n(await tx.delete(s.stockCounts).where(eq(s.stockCounts.isDemo, true)).returning({ id: s.stockCounts.id }));
    counts.weekly_orders = n(await tx.delete(s.weeklyOrders).where(or(eq(s.weeklyOrders.isDemo, true), byClients(s.weeklyOrders.clientId))).returning({ id: s.weeklyOrders.id }));
    counts.delivery_drops = n(await tx.delete(s.deliveryDrops).where(byClients(s.deliveryDrops.clientId)).returning({ id: s.deliveryDrops.id }));
    counts.payments = n(await tx.delete(s.payments).where(or(eq(s.payments.isDemo, true), byClients(s.payments.clientId))).returning({ id: s.payments.id }));
    counts.invoices = n(await tx.delete(s.invoices).where(or(eq(s.invoices.isDemo, true), byClients(s.invoices.clientId))).returning({ id: s.invoices.id }));
    counts.subscriptions = n(await tx.delete(s.subscriptions).where(or(eq(s.subscriptions.isDemo, true), byClients(s.subscriptions.clientId))).returning({ id: s.subscriptions.id }));
    counts.checkins = n(await tx.delete(s.checkins).where(or(eq(s.checkins.isDemo, true), byClients(s.checkins.clientId))).returning({ id: s.checkins.id }));
    // remaining client-owned rows (consultations, nutrition, swaps, add-ons, pauses, credits, ratings, order days/meals) cascade
    counts.clients = n(await tx.delete(s.clients).where(eq(s.clients.isDemo, true)).returning({ id: s.clients.id }));
    counts.notifications = n(await tx.delete(s.notifications).where(byUsers(s.notifications.userId)).returning({ id: s.notifications.id }));
    counts.telegram_links = n(await tx.delete(s.telegramLinks).where(byUsers(s.telegramLinks.userId)).returning({ id: s.telegramLinks.id }));
    counts.sessions = n(await tx.delete(s.session).where(byUsers(s.session.userId)).returning({ id: s.session.id }));
    counts.accounts = n(await tx.delete(s.account).where(byUsers(s.account.userId)).returning({ id: s.account.id }));
    // comments, reactions, challenge check-ins, reports and mutes by demo users cascade with the user
    counts.users = n(await tx.delete(s.user).where(eq(s.user.isDemo, true)).returning({ id: s.user.id }));
    return counts;
  };
  return "transaction" in db ? (db as { transaction: <T>(f: (tx: DbOrTx) => Promise<T>) => Promise<T> }).transaction(run) : run(db);
}
