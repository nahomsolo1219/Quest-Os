import "server-only";
import type { z } from "zod";
import { ForbiddenError } from "@/server/authz";
import { ServiceError, type Ctx } from "@/server/services/context";
import { UploadError } from "@/server/storage";
import { getActor, serviceCtx } from "@/server/session";

export type ActionResult<T = undefined> = { ok: true; data: T; message?: string } | { ok: false; error: string };

/**
 * Wraps a server action: validates input with Zod on the server, builds the service context for the signed-in
 * actor, and turns known errors into specific messages. Services do the authorization.
 */
export async function runAction<S extends z.ZodType, T>(schema: S, input: unknown, fn: (ctx: Ctx, data: z.infer<S>) => Promise<T>, message?: string): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  try {
    const ctx = await serviceCtx(await getActor());
    const data = await fn(ctx, parsed.data);
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof ServiceError || e instanceof ForbiddenError || e instanceof UploadError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "Something went wrong. Try again, and tell operations if it keeps happening." };
  }
}
