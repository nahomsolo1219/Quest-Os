import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shell/empty-state";
import { AccessBanner } from "@/components/community/access-banner";
import { ChallengeCheckIn } from "@/components/community/challenge-checkin";
import { NoAccess } from "@/components/community/no-access";
import { PersonAvatar } from "@/components/community/person";
import { cn } from "@/lib/utils";
import { ForbiddenError } from "@/server/authz";
import { ServiceError } from "@/server/services/context";
import { challengeDetail } from "@/server/services/community";
import { requirePageActor, serviceCtx } from "@/server/session";
import { formatAddisDateTime, formatDate } from "@/domain/time";
import { S } from "../../strings";

export const dynamic = "force-dynamic";

export default async function ChallengePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const { id } = await params;
  let c;
  try {
    c = await challengeDetail(await serviceCtx(actor), id);
  } catch (e) {
    if (e instanceof ForbiddenError) return <NoAccess message={e.message} />;
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  const v = c.viewer;
  const reason = c.state === "upcoming" ? S.notStarted : c.state === "ended" ? S.ended : null;
  return (
    <div className="space-y-5">
      <Link href="/app/community/challenges" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />{S.backToChallenges}
      </Link>
      <AccessBanner viewer={v} mutedLabel={v.mutedUntil ? formatAddisDateTime(new Date(v.mutedUntil)) : null} />
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{c.title}</h1>
          <Badge variant={c.state === "active" ? "default" : "secondary"}>{S.state[c.state]}</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{S.dates(formatDate(c.startsOn), formatDate(c.endsOn))} · {S.participants(c.participants)}</p>
      </header>
      <div className="rounded-2xl border p-4">
        <p className="text-lg font-semibold">{c.question}</p>
        <div className="mt-4">
          <ChallengeCheckIn challengeId={c.id} canCheckIn={c.canCheckIn} checkedInToday={c.checkedInToday} reason={reason ?? (v.canPost ? null : S.checkInMembersOnly)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{S.streak}</p>
          <p className="stat-number mt-1 flex items-center gap-1 text-3xl font-bold"><Flame className="size-6 text-primary" aria-hidden />{c.myStreak}</p>
          <p className="text-xs text-muted-foreground">{S.dayUnit(c.myStreak)}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">{S.days}</p>
          <p className="stat-number mt-1 text-3xl font-bold">{c.myDays}</p>
          <p className="text-xs text-muted-foreground">{S.dayUnit(c.myDays)}</p>
        </div>
      </div>
      <section aria-labelledby="board-h">
        <h2 id="board-h" className="mb-2 text-lg font-bold">{S.leaderboard}</h2>
        {c.leaderboard.length === 0 ? <EmptyState title={S.emptyBoard}>{S.emptyBoardBody}</EmptyState> : (
          <ol className="divide-y rounded-xl border">
            {c.leaderboard.map((r) => (
              <li key={r.userId} className={cn("flex min-h-14 items-center gap-3 px-3", r.me && "bg-accent font-semibold")}>
                <span className="w-6 text-center font-bold text-muted-foreground">{r.rank}</span>
                <PersonAvatar person={r} size={32} />
                <span className="min-w-0 flex-1 truncate">{r.name}{r.me ? ` (${S.you})` : ""}</span>
                <span className="stat-number font-bold">{r.days}</span>
                <span className="w-8 text-xs text-muted-foreground">{S.dayUnit(r.days)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
