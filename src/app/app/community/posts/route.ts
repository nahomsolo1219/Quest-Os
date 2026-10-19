// Creates a community post from multipart form data (photos are compressed in the browser first).
// A route handler instead of a server action so four photos fit without raising the server-action body limit.
import { NextResponse } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/server/authz";
import { ServiceError } from "@/server/services/context";
import { createPost } from "@/server/services/community";
import { UploadError } from "@/server/storage";
import { getActor, serviceCtx } from "@/server/session";
import { POST_TYPES } from "@/domain/types";

export const dynamic = "force-dynamic";

const schema = z.object({
  type: z.enum(POST_TYPES, "Choose a post type."),
  body: z.string().trim().min(1, "Write something before posting.").max(2000, "Posts can be at most 2,000 characters."),
  shareProgress: z.boolean(),
});

export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in again to post." }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "The upload did not arrive. Try again." }, { status: 400 });
  }
  const parsed = schema.safeParse({ type: form.get("type"), body: form.get("body"), shareProgress: form.get("shareProgress") === "true" });
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const photos = form.getAll("photos").filter((f): f is File => typeof f !== "string");
  try {
    const r = await createPost(await serviceCtx(actor), { ...parsed.data, photos });
    return NextResponse.json({ ok: true, data: r });
  } catch (e) {
    if (e instanceof ServiceError || e instanceof ForbiddenError || e instanceof UploadError) {
      return NextResponse.json({ ok: false, error: e.message }, { status: e instanceof ForbiddenError ? 403 : 400 });
    }
    console.error(e);
    return NextResponse.json({ ok: false, error: "Something went wrong. Try again, and tell operations if it keeps happening." }, { status: 500 });
  }
}
