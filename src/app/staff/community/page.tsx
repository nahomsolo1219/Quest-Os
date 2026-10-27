import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { UnderlineTabsList, UnderlineTabsTrigger } from "@/components/shell/underline-tabs";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { PinButton } from "@/components/community/coach-buttons";
import { AnnouncementForm, ChallengeForm } from "@/components/community/staff/coach-forms";
import { MembersTable } from "@/components/community/staff/members-table";
import { ReportActions, UnhideButton } from "@/components/community/staff/moderation-buttons";
import { communityPowers } from "@/domain/community";
import { addDays, addisDate, formatAddisDateTime, weekStartOf } from "@/domain/time";
import { hiddenItems, members, recentPostsForCoach, reportsQueue } from "@/server/services/community";
import { requirePageActor, serviceCtx } from "@/server/session";
import { T } from "./strings";

export const dynamic = "force-dynamic";

export default async function StaffCommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const actor = await requirePageActor("owner", "operations", "coach");
  const ctx = await serviceCtx(actor);
  const powers = communityPowers(actor.roles);
  const [reports, hidden, people, recent] = await Promise.all([
    powers.moderate ? reportsQueue(ctx) : Promise.resolve([]),
    powers.moderate ? hiddenItems(ctx) : Promise.resolve([]),
    powers.moderate ? members(ctx) : Promise.resolve([]),
    powers.pin ? recentPostsForCoach(ctx) : Promise.resolve([]),
  ]);
  const today = addisDate(ctx.now);
  const weekEnd = addDays(weekStartOf(today), 6);
  // ?tab=coach|reports|hidden|members opens that tab (links from the guided tour); otherwise the first one this person has
  const { tab } = await searchParams;
  const allowed = [...(powers.moderate ? ["reports", "hidden", "members"] : []), ...(powers.pin ? ["coach"] : [])];
  const first = tab && allowed.includes(tab) ? tab : powers.moderate ? "reports" : "coach";

  return (
    <div>
      <PageHeader title={T.title} description={T.intro} actions={<Button asChild variant="outline" className="h-11"><Link href="/app/community">{T.openFeed}</Link></Button>} />
      <Tabs key={first} defaultValue={first}>
        <UnderlineTabsList data-tour="community-tabs">
          {powers.moderate ? (
            <>
              <UnderlineTabsTrigger value="reports">{T.tabs.reports}{reports.length ? ` (${reports.length})` : ""}</UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="hidden">{T.tabs.hidden}</UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="members">{T.tabs.members}</UnderlineTabsTrigger>
            </>
          ) : null}
          {powers.pin ? <UnderlineTabsTrigger value="coach">{T.tabs.coach}</UnderlineTabsTrigger> : null}
        </UnderlineTabsList>

        {powers.moderate ? (
          <>
            <TabsContent value="reports" className="mt-4" data-tour="community-reports">
              {reports.length === 0 ? <EmptyState title={T.reportsEmpty}>{T.reportsEmptyBody}</EmptyState> : (
                <ul className="space-y-3">
                  {reports.map((r) => (
                    <li key={r.id} className="rounded-xl border bg-card p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold">“{r.reason}”</p>
                        <p className="text-xs text-muted-foreground">{T.reportedBy(r.reporter)} · {formatAddisDateTime(new Date(r.createdAt))}</p>
                      </div>
                      {r.preview != null ? (
                        <blockquote className="mt-2 rounded-lg bg-muted p-3 text-sm">
                          <p className="mb-1 text-xs font-medium text-muted-foreground">{T.postBy(r.targetType, r.targetAuthor ?? "Member")}{r.targetHidden ? ` · ${T.alreadyHidden}` : ""}</p>
                          <p className="whitespace-pre-wrap break-words">{r.preview}</p>
                        </blockquote>
                      ) : <p className="mt-2 text-sm text-muted-foreground">{T.targetGone}</p>}
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        {r.postId ? <Button asChild variant="link" className="h-11 px-0"><Link href={`/app/community/${r.postId}`}>{T.view}</Link></Button> : <span />}
                        <ReportActions reportId={r.id} reason={r.reason} targetHidden={r.targetHidden || r.preview == null} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="hidden" className="mt-4">
              {hidden.length === 0 ? <EmptyState title={T.hiddenEmpty}>{T.hiddenEmptyBody}</EmptyState> : (
                <ul className="space-y-3">
                  {hidden.map((h) => (
                    <li key={`${h.targetType}-${h.id}`} className="rounded-xl border border-dashed bg-card p-4">
                      <p className="text-xs text-muted-foreground">{T.hiddenMeta(h.targetType, h.author, h.hiddenBy, formatAddisDateTime(new Date(h.hiddenAt)))}</p>
                      {h.reason ? <p className="mt-1 text-sm font-medium">Reason: {h.reason}</p> : null}
                      <p className="mt-2 whitespace-pre-wrap break-words text-sm">{h.preview}</p>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <Button asChild variant="link" className="h-11 px-0"><Link href={`/app/community/${h.postId}`}>{T.view}</Link></Button>
                        <UnhideButton targetType={h.targetType} targetId={h.id} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            <TabsContent value="members" className="mt-4">
              <MembersTable rows={people.map((m) => ({
                userId: m.userId, name: m.name, status: m.status, access: m.access,
                mutedLabel: m.mutedUntil ? formatAddisDateTime(new Date(m.mutedUntil)) : null, muteReason: m.muteReason,
              }))} />
            </TabsContent>
          </>
        ) : null}

        {powers.pin ? (
          <TabsContent value="coach" className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="min-w-0" data-tour="community-challenge">
              <CardHeader><CardTitle>{T.challengeTitle}</CardTitle></CardHeader>
              <CardContent><ChallengeForm today={today} weekEnd={weekEnd < today ? today : weekEnd} /></CardContent>
            </Card>
            <Card className="min-w-0" data-tour="community-announce">
              <CardHeader><CardTitle>{T.announceTitle}</CardTitle></CardHeader>
              <CardContent><AnnouncementForm /></CardContent>
            </Card>
            <Card className="min-w-0 lg:col-span-2" data-tour="community-pin">
              <CardHeader><CardTitle>{T.pinTitle}</CardTitle></CardHeader>
              <CardContent>
                {recent.length === 0 ? <EmptyState title={T.pinEmpty}>{T.pinEmptyBody}</EmptyState> : (
                  <ul className="divide-y">
                    {recent.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 py-2">
                        <Link href={`/app/community/${p.id}`} data-tour="community-pin-post" className="min-w-0 flex-1 hover:underline">
                          <p className="text-xs text-muted-foreground">{p.author.name} · {p.when}{p.pinned ? " · Pinned" : ""}</p>
                          <p className="truncate text-sm">{p.body}</p>
                        </Link>
                        <PinButton postId={p.id} pinned={p.pinned} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
