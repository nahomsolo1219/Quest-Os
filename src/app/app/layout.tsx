import { ClientShell } from "@/components/shell/client-shell";
import { requirePageActor, serviceCtx } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";
import { tourBoot } from "@/server/tour-boot";

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  // Clients, plus coaches (community) and staff previewing the community.
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const ctx = await serviceCtx(actor);
  const [unread, tour] = await Promise.all([unreadCount(ctx), tourBoot({ ...ctx, actor })]);
  return <ClientShell unread={unread} tour={tour}>{children}</ClientShell>;
}
