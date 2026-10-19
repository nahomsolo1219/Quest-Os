import { can, type Actor, type Permission } from "@/server/authz";
import { S } from "./strings";

/** Settings tabs and the permission each needs (PERMISSIONS in src/server/authz). */
export const SETTINGS_TABS: { href: string; label: string; permission: Permission }[] = [
  { href: "/staff/settings/pricing", label: S.tabs.pricing, permission: "pricing.write" },
  { href: "/staff/settings/nutrition", label: S.tabs.nutrition, permission: "settings.nutrition.write" },
  { href: "/staff/settings/schedule", label: S.tabs.schedule, permission: "settings.write" },
  { href: "/staff/settings/packages", label: S.tabs.packages, permission: "packages.write" },
  { href: "/staff/settings/swaps", label: S.tabs.swaps, permission: "swapRules.write" },
  { href: "/staff/settings/areas", label: S.tabs.areas, permission: "areas.write" },
  { href: "/staff/settings/ingredients", label: S.tabs.ingredients, permission: "ingredients.read" },
  { href: "/staff/settings/changes", label: S.tabs.changes, permission: "audit.read" },
];

export const tabsFor = (actor: Actor) => SETTINGS_TABS.filter((t) => can(actor, t.permission));
