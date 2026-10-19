import Link from "next/link";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { MarkReadButton } from "@/components/client/notification-actions";
import { requirePageActor, serviceCtx } from "@/server/session";
import { listMyNotifications } from "@/server/services/notifications";
import { formatAddisDateTime } from "@/domain/time";
import { cn } from "@/lib/utils";
import { T } from "../strings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Notifications" };

export default async function NotificationsPage() {
  // clients and coaches (the community side) both land here from the bell
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const items = await listMyNotifications(await serviceCtx(actor));
  const unread = items.filter((n) => !n.readAt);
  return (
    <div className="space-y-4">
      <PageHeader title={T.notifications.title} actions={unread.length ? <MarkReadButton ids="all" /> : null} />
      {items.length === 0 ? <EmptyState title={T.notifications.none}>{T.notifications.noneHint}</EmptyState> : (
        <ul className="space-y-2">
          {items.map((n) => (
            <li key={n.id} className={cn("rounded-xl border p-3", n.readAt ? "bg-card" : "border-primary/40 bg-primary/5")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">{n.title}</p>
                  {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                  <p className="mt-1 text-xs text-muted-foreground">{formatAddisDateTime(n.createdAt)}</p>
                </div>
                {!n.readAt ? <MarkReadButton ids={[n.id]} /> : null}
              </div>
              {n.link && n.link.startsWith("/app") ? <Link href={n.link} className="mt-1 inline-flex min-h-11 min-w-11 items-center text-sm font-semibold text-primary">{T.notifications.open}</Link> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
