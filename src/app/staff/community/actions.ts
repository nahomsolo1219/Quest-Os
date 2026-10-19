"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import * as com from "@/server/services/community";

const uuid = z.uuid("That item was not found.");
const target = z.enum(["post", "comment"]);
const reason = z.string().trim().min(1, "Give a reason.").max(500, "Keep the reason under 500 characters.");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

function refresh() {
  revalidatePath("/staff/community");
  revalidatePath("/app/community");
}

export async function resolveReportAction(input: { reportId: string; action: "hide" | "dismiss"; reason?: string }) {
  return runAction(z.object({ reportId: uuid, action: z.enum(["hide", "dismiss"]), reason: z.string().trim().max(500).optional() }), input,
    async (ctx, d) => { await com.resolveReport(ctx, d); refresh(); }, input.action === "hide" ? "Hidden from members." : "Report dismissed.");
}

export async function hideAction(input: { targetType: string; targetId: string; reason: string }) {
  return runAction(z.object({ targetType: target, targetId: uuid, reason }), input, async (ctx, d) => { await com.hide(ctx, d); refresh(); }, "Hidden from members.");
}

export async function unhideAction(input: { targetType: string; targetId: string }) {
  return runAction(z.object({ targetType: target, targetId: uuid }), input, async (ctx, d) => { await com.unhide(ctx, d); refresh(); }, "Visible to members again.");
}

export async function muteAction(input: { userId: string; days: number; reason: string }) {
  return runAction(z.object({ userId: uuid, days: z.union([z.literal(1), z.literal(3), z.literal(7)], "Choose 1, 3 or 7 days."), reason }), input,
    async (ctx, d) => { await com.mute(ctx, d); refresh(); }, "Member muted.");
}

export async function unmuteAction(input: { userId: string }) {
  return runAction(z.object({ userId: uuid }), input, async (ctx, d) => { await com.unmute(ctx, d); refresh(); }, "Mute lifted.");
}

export async function createChallengeAction(input: { title: string; question: string; startsOn: string; endsOn: string }) {
  return runAction(z.object({
    title: z.string().trim().min(1, "Give the challenge a title.").max(120, "Keep the title short (120 characters)."),
    question: z.string().trim().min(1, "Write the daily check-in question.").max(200, "Keep the question under 200 characters."),
    startsOn: date, endsOn: date,
  }), input, async (ctx, d) => {
    const r = await com.createChallenge(ctx, d);
    revalidatePath("/app/community/challenges");
    refresh();
    return r;
  }, "Challenge created. Members get a notification.");
}

export async function announcementAction(input: { body: string }) {
  return runAction(z.object({ body: z.string().trim().min(1, "Write the announcement.").max(2000, "Posts can be at most 2,000 characters.") }), input,
    async (ctx, d) => { const r = await com.createPost(ctx, { type: "announcement", body: d.body }); refresh(); return r; },
    "Announcement posted. Members get a notification.");
}
