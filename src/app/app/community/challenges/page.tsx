import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { AccessBanner } from "@/components/community/access-banner";
import { NoAccess } from "@/components/community/no-access";
import { cn } from "@/lib/utils";
import { ForbiddenError } from "@/server/authz";
import { listChallenges } from "@/server/services/community";
import { requirePageActor, serviceCtx } from "@/server/session";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "../strings";
import { StatusBadge } from "@/components/shell/status-badge";

export const dynamic = "force-dynamic";

export default async function ChallengesPage() {
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  let data;
  try {
    data = await listChallenges(await serviceCtx(actor));
  } catch (e) {
    if (e instanceof ForbiddenError) return <NoAccess message={e.message} />;
    throw e;
  }
  const v = data.viewer;
  return (
    <div>
      <Link href="/app/community" className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />{S.back}
      </Link>
      <PageHeader title={S.challengesTitle} description={S.challengesIntro} />
      <AccessBanner viewer={v} mutedLabel={v.mutedUntil ? formatAddisDateTime(new Date(v.mutedUntil)) : null} />
      {data.challenges.length === 0 ? (
        <EmptyState title={S.emptyChallenges}>{v.coach ? "Create one from Staff → Community → Coach tools." : S.emptyChallengesBody}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.challenges.map((c) => (
            <li key={c.id}>
              <Link href={`/app/community/challenges/${c.id}`}
                className={cn("flex min-h-11 items-center gap-3 rounded-2xl border bg-card p-4 hover:bg-accent", c.state === "active" && "border-l-4 border-l-lime", c.state === "ended" && "opacity-70")}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{c.title}</span>
                    <Badge variant={c.state === "active" ? "default" : "secondary"}>{S.state[c.state]}</Badge>
                    {c.checkedInToday ? <StatusBadge tone="good">{S.doneToday}</StatusBadge> : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.question}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {S.dates(formatDate(c.startsOn), formatDate(c.endsOn))} · {S.participants(c.participants)} · {S.myDays(c.myDays)}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
