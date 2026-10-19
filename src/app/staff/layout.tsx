import { StaffShell } from "@/components/shell/staff-shell";
import { requirePageActor, serviceCtx } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("owner", "operations", "nutritionist", "kitchen", "delivery", "coach");
  const unread = await unreadCount(await serviceCtx(actor));
  return <StaffShell roles={actor.roles} name={actor.name} unread={unread}>{children}</StaffShell>;
}
