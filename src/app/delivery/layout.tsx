import { StaffShell } from "@/components/shell/staff-shell";
import { requirePageActor, serviceCtx } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";
import { tourBoot } from "@/server/tour-boot";

export default async function DeliveryLayout({ children }: { children: React.ReactNode }) {
  const actor = await requirePageActor("owner", "operations", "delivery");
  const ctx = await serviceCtx(actor);
  const [unread, tour] = await Promise.all([unreadCount(ctx), tourBoot({ ...ctx, actor })]);
  return <StaffShell roles={actor.roles} name={actor.name} unread={unread} tour={tour}>{children}</StaffShell>;
}
