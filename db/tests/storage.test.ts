// File storage: local driver, signed URLs, and who may get a receipt URL (SEC-08, SEC-09, DATA-09).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import { loadActor, ForbiddenError } from "../../src/server/authz";
import { receiptUrl } from "../../src/server/services/billing";
import { newKey, parseKey, putImage, storage, STORAGE_PREFIXES } from "../../src/server/storage";
import { signLocal, verifyLocal } from "../../src/server/storage/local";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
let dir = "";
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "qm-storage-"));
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_DIR = dir;
  process.env.FILE_URL_SECRET = "test-file-secret";
});
afterAll(async () => { rmSync(dir, { recursive: true, force: true }); await conn.end({ timeout: 5 }); });

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64"));

describe("storage", () => {
  it("uses the receipts/, community/ and avatars/ prefixes and the local driver by default", async () => {
    expect(STORAGE_PREFIXES).toEqual(["receipts", "community", "avatars"]);
    const owner = "11111111-1111-4111-8111-111111111111";
    const key = await putImage("receipts", owner, new File([PNG], "r.png", { type: "image/png" }));
    expect(parseKey(key)).toEqual({ prefix: "receipts", ownerId: owner });
    const got = await storage().get(key);
    expect(got?.contentType).toBe("image/png");
    expect(got?.body.length).toBe(PNG.length);
  });

  it("rejects non-images, oversize files and path tricks", async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    await expect(putImage("receipts", owner, new File(["x"], "a.txt", { type: "text/plain" }))).rejects.toThrow(/JPG, PNG or WebP/);
    await expect(putImage("receipts", owner, new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" }))).rejects.toThrow(/5 MB/);
    expect(parseKey("receipts/../../etc/passwd")).toBeNull();
    expect(newKey("avatars", owner, "image/webp")).toMatch(/^avatars\/1{8}-1{4}-4111-8111-1{12}\/[0-9a-f-]{36}\.webp$/);
  });

  it("signed URLs expire and a tampered signature is refused (SEC-09)", () => {
    const key = "receipts/a/b.png";
    const exp = Math.floor(Date.now() / 1000) + 60;
    const sig = signLocal(key, exp);
    expect(verifyLocal(key, exp, sig)).toBe(true);
    expect(verifyLocal(key, exp, sig.slice(0, -2) + "xx")).toBe(false);
    expect(verifyLocal("receipts/a/other.png", exp, sig)).toBe(false);
    expect(verifyLocal(key, exp, sig, (exp + 1) * 1000)).toBe(false);
  });

  it("the file route serves only valid signed links", async () => {
    const { GET } = await import("../../src/app/api/files-local/route");
    const owner = "22222222-2222-4222-8222-222222222222";
    const key = await putImage("receipts", owner, new File([PNG], "r.png", { type: "image/png" }));
    const url = await storage().signedUrl(key, 60);
    const { NextRequest } = await import("next/server");
    const ok = await GET(new NextRequest(`http://localhost${url}`));
    expect(ok.status).toBe(200);
    const bad = await GET(new NextRequest(`http://localhost${url.replace(/sig=[^&]+/, "sig=nope")}`));
    expect(bad.status).toBe(403);
  });

  it("receipt URLs: the client who owns it and payment staff only (SEC-08)", async () => {
    await inRollback(db, async (tx) => {
      const clientsWithUsers = await tx.select().from(s.clients).where(eq(s.clients.status, "active")).limit(2);
      const [a, b] = clientsWithUsers;
      const key = await putImage("receipts", a.id, new File([PNG], "r.png", { type: "image/png" }));
      const actorOf = async (userId: string) => (await loadActor(tx, userId))!;
      const [ops] = await tx.select().from(s.user).where(eq(s.user.email, "nebiyou@questmeals.demo"));
      const [kitchen] = await tx.select().from(s.user).where(eq(s.user.email, "kitchen@questmeals.demo"));
      const now = new Date();
      expect(await receiptUrl({ db: tx, actor: await actorOf(a.userId!), now }, key)).toContain("/api/files-local?");
      expect(await receiptUrl({ db: tx, actor: await actorOf(ops.id), now }, key)).toContain("sig=");
      await expect(receiptUrl({ db: tx, actor: await actorOf(b.userId!), now }, key)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receiptUrl({ db: tx, actor: await actorOf(kitchen.id), now }, key)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receiptUrl({ db: tx, actor: null, now }, key)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(receiptUrl({ db: tx, actor: await actorOf(ops.id), now }, `community/${a.id}/x.png`)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
