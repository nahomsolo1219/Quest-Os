// Demo copy of the app (Railway service `demo`, DEMO_MODE=true). Production never sets DEMO_MODE,
// so every demo-only path checks isDemoMode() and is a no-op or 404 without it.

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

/** Link back to the real app in the demo banner (optional). */
export function realAppUrl(): string | null {
  const v = process.env.DEMO_REAL_APP_URL?.trim();
  return v && /^https?:\/\//.test(v) ? v : null;
}

export type DemoAccount = { role: string; name: string; login: string; kind: "email" | "phone"; password: string; note: string };

/** One-tap sign-in on the demo login page. Accounts come from db/seed/demo.ts and the tour data (coach). */
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Owner", name: "Fahim Mohammed", login: "fahim@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Money, prices, team" },
  { role: "Operations", name: "Nebiyou Tadesse", login: "nebiyou@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Clients, payments, orders" },
  { role: "Nutritionist", name: "Hana Girma", login: "nutritionist@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Targets, portions, swaps" },
  { role: "Kitchen", name: "Meron Abebe", login: "kitchen@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Cook, pack, count stock" },
  { role: "Rider", name: "Yonas Haile", login: "rider@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Today's drops" },
  { role: "Coach", name: "Selam Tesfaye", login: "coach@questmeals.demo", kind: "email", password: "QuestDemo2026!", note: "Community" },
  { role: "Client", name: "Abel Tesfaye", login: "+251911000001", kind: "phone", password: "Client2026!", note: "Daily delivery" },
  { role: "Client", name: "Sara Mekonnen", login: "+251911000002", kind: "phone", password: "Client2026!", note: "Pick-up at the cafe" },
];
