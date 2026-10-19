import type { Role } from "@/domain/types";

export type NavItem = { href: string; label: string; roles: Role[] };

/** Staff-side navigation. Items show only for the roles listed. */
export const STAFF_NAV: NavItem[] = [
  { href: "/staff/dashboard", label: "Dashboard", roles: ["owner"] },
  { href: "/staff", label: "Today", roles: ["owner", "operations", "nutritionist"] },
  { href: "/staff/clients", label: "Clients", roles: ["owner", "operations", "nutritionist"] },
  { href: "/staff/payments", label: "Payments", roles: ["owner", "operations"] },
  { href: "/staff/orders", label: "Weekly orders", roles: ["owner", "operations"] },
  { href: "/staff/quick-starts", label: "Quick starts", roles: ["owner", "operations"] },
  { href: "/staff/nutrition", label: "Nutrition", roles: ["owner", "nutritionist"] },
  { href: "/staff/purchasing", label: "Purchasing", roles: ["owner", "operations"] },
  { href: "/staff/delivery", label: "Delivery", roles: ["owner", "operations"] },
  { href: "/kitchen", label: "Kitchen", roles: ["owner", "operations", "kitchen"] },
  { href: "/kitchen/stock", label: "Stock count", roles: ["operations", "kitchen"] },
  { href: "/kitchen/waste", label: "Waste log", roles: ["operations", "kitchen"] },
  { href: "/delivery", label: "My drops", roles: ["delivery"] },
  { href: "/delivery/pickup", label: "Pick-up list", roles: ["operations", "delivery"] },
  { href: "/staff/community", label: "Community", roles: ["owner", "operations", "coach"] },
  { href: "/staff/partners", label: "Partners", roles: ["owner"] },
  { href: "/staff/settings", label: "Settings", roles: ["owner"] },
  { href: "/staff/notifications", label: "Notifications", roles: ["owner", "operations", "nutritionist", "kitchen", "delivery", "coach"] },
];

export const KITCHEN_NAV: NavItem[] = [
  { href: "/kitchen", label: "Cook days", roles: ["owner", "operations", "kitchen"] },
  { href: "/kitchen/stock", label: "Stock count", roles: ["owner", "operations", "kitchen"] },
  { href: "/kitchen/waste", label: "Waste log", roles: ["owner", "operations", "kitchen"] },
];

export const CLIENT_NAV: NavItem[] = [
  { href: "/app", label: "Today", roles: ["client"] },
  { href: "/app/menu", label: "Menu", roles: ["client"] },
  { href: "/app/community", label: "Community", roles: ["client"] },
  { href: "/app/progress", label: "Progress", roles: ["client"] },
  { href: "/app/plan", label: "Plan", roles: ["client"] },
];

export function navFor(items: NavItem[], roles: Role[]): NavItem[] {
  return items.filter((i) => i.roles.some((r) => roles.includes(r)));
}
