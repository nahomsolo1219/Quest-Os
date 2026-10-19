import "server-only";
import { redirect } from "next/navigation";
import { can, type Permission } from "@/server/authz";
import { requirePageActor } from "@/server/session";

/** Page guard: staff who hold `permission`; others go back to the settings index. */
export async function requireSettingsTab(permission: Permission) {
  const actor = await requirePageActor("owner", "operations", "nutritionist");
  if (!can(actor, permission)) redirect("/staff/settings");
  return actor;
}
