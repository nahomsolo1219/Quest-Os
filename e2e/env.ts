// Shared constants for the e2e suite (no Playwright test imports here: global setup uses it too).
import path from "node:path";

export const E2E_DB_URL = process.env.DATABASE_URL_E2E ?? "postgres://postgres:postgres@localhost:54329/questmeals_e2e";
/** Second e2e server: same build and database, DEMO_MODE=true (e2e/demo.spec.ts only). */
export const DEMO_PORT = Number(process.env.E2E_DEMO_PORT ?? 3101);
export const DEMO_URL = `http://localhost:${DEMO_PORT}`;
export const AUTH_DIR = path.resolve(__dirname, ".auth");
export const STAFF_PASSWORD = "QuestDemo2026!";
export const CLIENT_PASSWORD = "Client2026!";

/** One login per role. Clients: Abel (weekly, daily delivery) and Sara (weekly, pick-up). */
export const LOGINS = {
  owner: { who: "dagi@questmeals.demo", password: STAFF_PASSWORD },
  fahim: { who: "fahim@questmeals.demo", password: STAFF_PASSWORD },
  ops: { who: "nebiyou@questmeals.demo", password: STAFF_PASSWORD },
  nutritionist: { who: "nutritionist@questmeals.demo", password: STAFF_PASSWORD },
  kitchen: { who: "kitchen@questmeals.demo", password: STAFF_PASSWORD },
  rider: { who: "rider@questmeals.demo", password: STAFF_PASSWORD },
  /** coach only (Selam, D608): created by e2e global setup, not by the base demo seed */
  coach: { who: "coach@questmeals.demo", password: STAFF_PASSWORD },
  client: { who: "0911000001", password: CLIENT_PASSWORD },
  client2: { who: "0911000002", password: CLIENT_PASSWORD },
  client5: { who: "0911000005", password: CLIENT_PASSWORD },
  client7: { who: "0911000007", password: CLIENT_PASSWORD },
  client8: { who: "0911000008", password: CLIENT_PASSWORD },
} as const;
export type RoleKey = keyof typeof LOGINS;
export const authFile = (key: RoleKey) => path.join(AUTH_DIR, `${key}.json`);

let ipCounter = 0;
/** A fresh client IP per sign-in: Better Auth rate-limits sign-in to 3 per 10 s per IP (x-forwarded-for). */
export function testIp(): string {
  ipCounter++;
  return `10.${process.pid % 250}.${Math.floor(ipCounter / 250) % 250}.${(ipCounter % 250) + 1}`;
}

/**
 * Both projects (phone, laptop) run every spec against the same database, so flows that change data use a
 * different demo client per project: Abel/Natnael pay, swap and rate; Mikias/Hiwot pause; ops confirms the
 * receipt that global setup uploaded for Sara (phone run) or Samuel (laptop run) and rejects Hiwot's / Mikias's.
 */
export const PROJECT_DATA = {
  phone: { payer: "client", payerName: "Abel Tesfaye", pauser: "client5", setupReceipt: "Sara Mekonnen", rejectReceipt: "Hiwot Desta", onboard: "Onboard Phone", newPhone: "0911200001" },
  laptop: { payer: "client7", payerName: "Natnael Worku", pauser: "client8", setupReceipt: "Samuel Kebede", rejectReceipt: "Mikias Alemayehu", onboard: "Onboard Laptop", newPhone: "0911200002" },
} as const satisfies Record<string, { payer: RoleKey; payerName: string; pauser: RoleKey; setupReceipt: string; rejectReceipt: string; onboard: string; newPhone: string }>;
export const dataFor = (project: string) => PROJECT_DATA[project === "laptop" ? "laptop" : "phone"];
