// Guided tour progress (staff-tour): own rows only, only tours for the person's roles, resume and finish.
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "../schema";
import { myTourProgress, saveTourProgress } from "../../src/server/services/tour";
import { ForbiddenError, loadActor } from "../../src/server/authz";
import { ServiceError, type Ctx } from "../../src/server/services/context";
import { inRollback, testDb } from "./helpers";

const { db, sql: conn } = testDb();
afterAll(() => conn.end({ timeout: 5 }));
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const NOW = new Date("2026-10-20T07:00:00Z");

async function ctxFor(tx: Tx, email: string): Promise<Ctx> {
  const [u] = await tx.select().from(s.user).where(eq(s.user.email, email));
  return { db: tx, actor: await loadActor(tx, u.id), now: NOW };
}

describe("tour progress", () => {
  it("saves and resumes per user; completes; only tours for the person's roles", async () => {
    await inRollback(db, async (tx) => {
      const dagi = await ctxFor(tx, "dagi@questmeals.demo"); // owner + coach
      const kitchen = await ctxFor(tx, "kitchen@questmeals.demo");
      expect(await myTourProgress(dagi)).toEqual({});
      await saveTourProgress(dagi, { tourId: "owner", step: 3, status: "started" });
      await saveTourProgress(dagi, { tourId: "owner", step: 4, status: "started" });
      await saveTourProgress(dagi, { tourId: "coach", step: 0, status: "skipped" });
      expect(await myTourProgress(dagi)).toEqual({ owner: { step: 4, status: "started" }, coach: { step: 0, status: "skipped" } });
      // another user's progress is separate
      expect(await myTourProgress(kitchen)).toEqual({});
      await expect(saveTourProgress(kitchen, { tourId: "owner", step: 0, status: "started" })).rejects.toBeInstanceOf(ServiceError);
      await saveTourProgress(kitchen, { tourId: "kitchen", step: 8, status: "completed" });
      expect((await myTourProgress(kitchen)).kitchen).toEqual({ step: 8, status: "completed" });
    });
  });

  it("clients have no tours and cannot save progress", async () => {
    await inRollback(db, async (tx) => {
      const [u] = await tx.select().from(s.user).where(eq(s.user.phoneNumber, "+251911000001"));
      const client: Ctx = { db: tx, actor: await loadActor(tx, u.id), now: NOW };
      expect(await myTourProgress(client)).toEqual({});
      await expect(saveTourProgress(client, { tourId: "owner", step: 0, status: "started" })).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
