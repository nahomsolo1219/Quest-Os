import { ClientShell } from "@/components/shell/client-shell";
import { requirePageActor, serviceCtx } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";

export default async function ClientAppLayout({ children }: { children: React.ReactNode }) {
  // Clients, plus coaches (community) and staff previewing the community.
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const unread = await unreadCount(await serviceCtx(actor));
  return <ClientShell unread={unread}>{children}</ClientShell>;
}
