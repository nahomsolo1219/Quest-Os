import Link from "next/link";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { MarkAllReadButton, MarkReadButton } from "@/components/ops/notification-buttons";
import { cn } from "@/lib/utils";
import { requirePageActor, serviceCtx } from "@/server/session";
import { listMyNotifications } from "@/server/services/notifications";
import { formatAddisDateTime } from "@/domain/time";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const actor = await requirePageActor();
  const items = await listMyNotifications(await serviceCtx(actor), 100);
  const unread = items.filter((n) => !n.readAt).length;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title={S.title} description={S.description(unread)} actions={unread ? <MarkAllReadButton /> : null} />
      <div data-tour="notifications-list">
      {items.length === 0 ? <EmptyState title={S.emptyTitle}>{S.emptyBody}</EmptyState> : (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((n) => (
            <li key={n.id} className={cn("flex flex-wrap items-start gap-3 p-3", !n.readAt && "bg-primary/5")}>
              <span aria-hidden className={cn("mt-2 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{!n.readAt ? <span className="sr-only">{S.unread}: </span> : null}{n.title}</p>
                {n.body ? <p className="text-sm text-muted-foreground">{n.body}</p> : null}
                <p className="mt-1 text-xs text-muted-foreground">{formatAddisDateTime(n.createdAt)}</p>
              </div>
              <div className="flex w-full gap-1 pl-5 sm:w-auto sm:pl-0">
                {n.link ? <Button asChild variant="outline" className="h-11 min-w-11"><Link href={n.link}>{S.open}</Link></Button> : null}
                {!n.readAt ? <MarkReadButton id={n.id} /> : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      </div>
    </div>
  );
}
