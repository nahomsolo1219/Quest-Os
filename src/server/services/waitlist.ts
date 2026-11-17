// Pre-launch waitlist on questaddis.com: a signed-out visitor leaves their name and phone and becomes a lead.
// One client per phone: a repeat sign-up is accepted quietly and changes nothing.
import { and, eq } from "drizzle-orm";
import { areas, clients } from "@db/schema";
import { can, ForbiddenError } from "@/server/authz";
import { normalizeEthiopianPhone } from "@/domain/phone";
import { ServiceError, type Ctx } from "./context";

export const WAITLIST_GOALS = ["lose", "build", "healthy"] as const;
export const WAITLIST_FASTING = ["wed_fri", "seasons", "none"] as const;

export type WaitlistInput = {
  name: string;
  phone: string;
  areaId: string | null;
  goal: (typeof WAITLIST_GOALS)[number];
  fasting: (typeof WAITLIST_FASTING)[number];
  telegram: boolean;
  source: string | null;
};

const GOAL_NOTE = { lose: "lose fat", build: "build muscle", healthy: "eat healthier" } as const;
const FASTING_NOTE = { wed_fri: "fasts Wed & Fri", seasons: "fasts Wed & Fri and fasting seasons", none: "not fasting" } as const;

export async function joinWaitlist(ctx: Ctx, input: WaitlistInput): Promise<{ already: boolean }> {
  if (!can(ctx.actor, "clients.createLead")) throw new ForbiddenError(undefined, "clients.createLead");
  const phone = normalizeEthiopianPhone(input.phone);
  if (!phone) throw new ServiceError("Enter an Ethiopian mobile number starting 9 or 7.", "phone_invalid");
  const [firstName, ...rest] = input.name.trim().split(/\s+/);
  if (!firstName) throw new ServiceError("Enter your name.");

  let areaId: string | null = null;
  if (input.areaId) {
    const [a] = await ctx.db.select({ id: areas.id }).from(areas).where(and(eq(areas.id, input.areaId), eq(areas.active, true)));
    areaId = a?.id ?? null;
  }

  const source = input.source?.replace(/[^\w-]/g, "").slice(0, 40) || null;
  const notes = [`Waitlist (questaddis.com${source ? `, ${source}` : ""})`, GOAL_NOTE[input.goal], FASTING_NOTE[input.fasting]].join(" · ");

  const [row] = await ctx.db.insert(clients).values({
    firstName,
    lastName: rest.join(" "),
    phone,
    status: "lead",
    leadSource: source === "ig" || source === "instagram" ? "instagram" : source === "ref" || source === "referral" ? "referral" : "other",
    leadNotes: notes,
    goal: input.goal === "lose" ? "lean" : input.goal === "build" ? "build" : null,
    areaId,
    telegramOptIn: input.telegram,
  }).onConflictDoNothing({ target: clients.phone }).returning({ id: clients.id });

  return { already: !row };
}
