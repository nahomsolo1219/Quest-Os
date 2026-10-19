import { type NextRequest } from "next/server";
import { localStorage, verifyLocal } from "@/server/storage/local";

export const dynamic = "force-dynamic";

/** Serves local-driver files only with a valid, unexpired signature (issued after an authorization check). */
export async function GET(request: NextRequest) {
  if (process.env.STORAGE_DRIVER === "s3") return new Response("Not found", { status: 404 });
  const p = request.nextUrl.searchParams;
  const key = p.get("key") ?? "";
  const expires = Number(p.get("expires"));
  const sig = p.get("sig") ?? "";
  if (!key || !verifyLocal(key, expires, sig)) return new Response("Link expired or invalid", { status: 403 });
  const file = await localStorage.get(key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(file.body), {
    headers: { "content-type": file.contentType, "cache-control": "private, max-age=300", "x-content-type-options": "nosniff" },
  });
}
