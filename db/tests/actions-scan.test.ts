// SEC-11: every server action validates its input with Zod on the server and runs through runAction (which builds
// the signed-in actor's context; services then authorize). Route handlers authenticate (session, signature or secret).
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
const files = walk("src/app");

describe("server actions", () => {
  const actionFiles = files.filter((f) => /\.(ts|tsx)$/.test(f) && /^["']use server["']/m.test(readFileSync(f, "utf8")));
  it("exist", () => expect(actionFiles.length).toBeGreaterThan(10));
  for (const file of actionFiles) {
    it(`${file}: every exported action uses runAction with a Zod schema`, () => {
      const src = readFileSync(file, "utf8");
      const bodies = src.split(/export async function /).slice(1);
      expect(bodies.length).toBeGreaterThan(0);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        expect(body.includes("runAction("), `${file} ${name} must call runAction`).toBe(true);
      }
      expect(/from ["']zod["']/.test(src), `${file} must import zod`).toBe(true);
    });
  }
});

describe("route handlers", () => {
  const routes = files.filter((f) => f.endsWith("route.ts"));
  const GUARDS = [/getActor\(/, /x-cron-secret/, /verifyLocal\(/, /x-telegram-bot-api-secret-token/, /toNextJsHandler\(/, /homePathFor\(/];
  for (const file of routes) {
    it(`${file} authenticates the caller`, () => {
      const src = readFileSync(file, "utf8");
      expect(GUARDS.some((g) => g.test(src)), file).toBe(true);
    });
  }
});
