import type { Role } from "@/domain/types";

/** Icon names map to lucide icons in nav-links.tsx (client component). */
export type NavIcon =
  | "dashboard" | "today" | "bell" | "clients" | "payments" | "quickstart" | "orders" | "purchasing" | "kitchen"
  | "stock" | "waste" | "delivery" | "pickup" | "drops" | "community" | "nutrition" | "partners" | "settings"
  | "menu" | "progress" | "plan";

export type NavSection = "Today" | "Clients & money" | "Kitchen & delivery" | "Community" | "Admin";

export type NavItem = { href: string; label: string; roles: Role[]; icon?: NavIcon; section?: NavSection };

/** Staff-side navigation, in sidebar order. Items show only for the roles listed; empty sections are hidden. */
export const STAFF_NAV: NavItem[] = [
  { href: "/staff/dashboard", label: "Dashboard", roles: ["owner"], icon: "dashboard", section: "Today" },
  { href: "/staff", label: "Today", roles: ["owner", "operations", "nutritionist"], icon: "today", section: "Today" },
  { href: "/staff/notifications", label: "Notifications", roles: ["owner", "operations", "nutritionist", "kitchen", "delivery", "coach"], icon: "bell", section: "Today" },
  { href: "/staff/clients", label: "Clients", roles: ["owner", "operations", "nutritionist"], icon: "clients", section: "Clients & money" },
  { href: "/staff/payments", label: "Payments", roles: ["owner", "operations"], icon: "payments", section: "Clients & money" },
  { href: "/staff/quick-starts", label: "Quick starts", roles: ["owner", "operations"], icon: "quickstart", section: "Clients & money" },
  { href: "/staff/orders", label: "Weekly orders", roles: ["owner", "operations"], icon: "orders", section: "Kitchen & delivery" },
  { href: "/staff/purchasing", label: "Purchasing", roles: ["owner", "operations"], icon: "purchasing", section: "Kitchen & delivery" },
  { href: "/kitchen", label: "Kitchen", roles: ["owner", "operations", "kitchen"], icon: "kitchen", section: "Kitchen & delivery" },
  { href: "/kitchen/stock", label: "Stock count", roles: ["operations", "kitchen"], icon: "stock", section: "Kitchen & delivery" },
  { href: "/kitchen/waste", label: "Waste log", roles: ["operations", "kitchen"], icon: "waste", section: "Kitchen & delivery" },
  { href: "/staff/delivery", label: "Delivery", roles: ["owner", "operations"], icon: "delivery", section: "Kitchen & delivery" },
  { href: "/delivery/pickup", label: "Pick-up list", roles: ["operations", "delivery"], icon: "pickup", section: "Kitchen & delivery" },
  { href: "/delivery", label: "My drops", roles: ["delivery"], icon: "drops", section: "Kitchen & delivery" },
  { href: "/staff/community", label: "Community", roles: ["owner", "operations", "coach"], icon: "community", section: "Community" },
  { href: "/staff/nutrition", label: "Nutrition", roles: ["owner", "nutritionist"], icon: "nutrition", section: "Admin" },
  { href: "/staff/partners", label: "Partners", roles: ["owner"], icon: "partners", section: "Admin" },
  { href: "/staff/settings", label: "Settings", roles: ["owner", "operations", "nutritionist"], icon: "settings", section: "Admin" },
];

export const KITCHEN_NAV: NavItem[] = [
  { href: "/kitchen", label: "Cook days", roles: ["owner", "operations", "kitchen"] },
  { href: "/kitchen/stock", label: "Stock count", roles: ["owner", "operations", "kitchen"] },
  { href: "/kitchen/waste", label: "Waste log", roles: ["owner", "operations", "kitchen"] },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/app", label: "Today", roles: ["client"], icon: "today" },
  { href: "/app/menu", label: "Menu", roles: ["client"], icon: "menu" },
  { href: "/app/community", label: "Community", roles: ["client"], icon: "community" },
  { href: "/app/progress", label: "Progress", roles: ["client"], icon: "progress" },
  { href: "/app/plan", label: "Plan", roles: ["client"], icon: "plan" },
];

export function navFor(items: NavItem[], roles: Role[]): NavItem[] {
  return items.filter((i) => i.roles.some((r) => roles.includes(r)));
}

/** Groups items by section in first-seen order; sections with no visible items do not appear. */
export function navSections(items: NavItem[]): { section: NavSection | null; items: NavItem[] }[] {
  const out: { section: NavSection | null; items: NavItem[] }[] = [];
  for (const i of items) {
    const s = i.section ?? null;
    const g = out.find((o) => o.section === s);
    if (g) g.items.push(i); else out.push({ section: s, items: [i] });
  }
  return out;
}
