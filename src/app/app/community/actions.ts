"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction } from "@/server/actions";
import * as com from "@/server/services/community";
import { POST_TYPES, REACTIONS } from "@/domain/types";

const uuid = z.uuid("That item was not found.");

export async function loadMoreAction(input: { cursor: string; type: string | null }) {
  return runAction(z.object({ cursor: z.string().min(1).max(500), type: z.enum(POST_TYPES).nullable() }), input,
    async (ctx, d) => {
      const r = await com.feed(ctx, { cursor: d.cursor, type: d.type });
      return { posts: r.posts, nextCursor: r.nextCursor };
    });
}

export async function reactAction(input: { postId: string; type: string | null }) {
  return runAction(z.object({ postId: uuid, type: z.enum(REACTIONS).nullable() }), input, (ctx, d) => com.react(ctx, d.postId, d.type));
}

export async function addCommentAction(input: { postId: string; body: string }) {
  return runAction(z.object({ postId: uuid, body: z.string().trim().min(1, "Write a comment first.").max(1000, "Comments can be at most 1,000 characters.") }), input,
    async (ctx, d) => {
      const r = await com.addComment(ctx, d);
      revalidatePath(`/app/community/${d.postId}`);
      return r;
    }, "Comment added.");
}

export async function markAnswerAction(input: { postId: string; commentId: string | null }) {
  return runAction(z.object({ postId: uuid, commentId: uuid.nullable() }), input, async (ctx, d) => {
    await com.markAnswer(ctx, d.postId, d.commentId);
    revalidatePath(`/app/community/${d.postId}`);
  }, input.commentId ? "Marked as the answer." : "Answer removed.");
}

export async function pinAction(input: { postId: string; pinned: boolean }) {
  return runAction(z.object({ postId: uuid, pinned: z.boolean() }), input, async (ctx, d) => {
    await com.pinPost(ctx, d.postId, d.pinned);
    revalidatePath("/app/community");
    revalidatePath(`/app/community/${d.postId}`);
    revalidatePath("/staff/community");
  }, input.pinned ? "Post pinned." : "Post unpinned.");
}

export async function reportAction(input: { targetType: string; targetId: string; reason: string }) {
  return runAction(z.object({
    targetType: z.enum(["post", "comment"]), targetId: uuid,
    reason: z.string().trim().min(1, "Tell us what is wrong with it.").max(500, "Keep the reason under 500 characters."),
  }), input, async (ctx, d) => { await com.report(ctx, d); }, "Thanks. Operations will review it.");
}

export async function checkInAction(input: { challengeId: string }) {
  return runAction(z.object({ challengeId: uuid }), input, async (ctx, d) => {
    const r = await com.checkInChallenge(ctx, d.challengeId);
    revalidatePath(`/app/community/challenges/${d.challengeId}`);
    revalidatePath("/app/community/challenges");
    return r;
  }, "Checked in. Keep it going!");
}
