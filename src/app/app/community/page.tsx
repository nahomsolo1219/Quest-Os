import Link from "next/link";
import { Plus, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shell/empty-state";
import { PageHeader } from "@/components/shell/page-header";
import { AccessBanner } from "@/components/community/access-banner";
import { FeedList } from "@/components/community/feed-list";
import { PostCard } from "@/components/community/post-card";
import { TypeChips } from "@/components/community/type-chips";
import { NoAccess } from "@/components/community/no-access";
import { ForbiddenError } from "@/server/authz";
import { feed, listChallenges } from "@/server/services/community";
import { requirePageActor, serviceCtx } from "@/server/session";
import { formatAddisDateTime } from "@/domain/time";
import { POST_TYPES, type PostType } from "@/domain/types";
import { S } from "./strings";

export const dynamic = "force-dynamic";

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const sp = await searchParams;
  const type = (POST_TYPES as readonly string[]).includes(sp.type ?? "") ? (sp.type as PostType) : null;
  const ctx = await serviceCtx(actor);
  let data;
  try {
    data = await feed(ctx, { type });
  } catch (e) {
    if (e instanceof ForbiddenError) return <NoAccess message={e.message} />;
    throw e;
  }
  const { challenges } = await listChallenges(ctx);
  const active = challenges.find((c) => c.state === "active");
  const v = data.viewer;
  const empty = data.pinned.length === 0 && data.posts.length === 0;

  return (
    <div>
      <PageHeader title={S.title} description={S.intro} actions={
        <>
          <Button asChild variant="outline" className="h-11"><Link href="/app/community/challenges"><Trophy className="size-4" aria-hidden />{S.challenges}</Link></Button>
          {v.canPost ? <Button asChild className="h-11"><Link href="/app/community/new"><Plus className="size-4" aria-hidden />{S.newPost}</Link></Button> : null}
        </>
      } />
      <AccessBanner viewer={v} mutedLabel={v.mutedUntil ? formatAddisDateTime(new Date(v.mutedUntil)) : null} />
      {active ? (
        <Link href={`/app/community/challenges/${active.id}`} className="mb-4 flex min-h-11 items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">{S.state.active}</p>
            <p className="truncate font-semibold">{active.title}</p>
            <p className="truncate text-sm text-muted-foreground">{active.question}</p>
          </div>
          <span className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-sm font-bold text-primary-foreground">{active.checkedInToday ? S.doneToday : v.canPost ? S.checkIn : S.view}</span>
        </Link>
      ) : null}
      <TypeChips active={type} />
      {empty ? (
        <EmptyState title={type ? S.emptyFiltered : S.emptyFeed}
          action={v.canPost ? <Button asChild className="h-11"><Link href={type ? `/app/community/new?type=${type === "announcement" && !v.coach ? "post" : type}` : "/app/community/new"}>{S.newPost}</Link></Button> : null}>
          {type ? S.emptyFilteredBody : S.emptyFeedBody}
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {data.pinned.length > 0 ? (
            <section aria-labelledby="pinned-h" className="space-y-3">
              <h2 id="pinned-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{S.pinned}</h2>
              {data.pinned.map((p) => <PostCard key={p.id} post={p} canReact={v.canReact} />)}
            </section>
          ) : null}
          {data.posts.length > 0 ? (
            <section aria-labelledby="latest-h" className="space-y-3">
              <h2 id="latest-h" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{S.latest}</h2>
              <FeedList key={type ?? "all"} initial={data.posts} cursor={data.nextCursor} type={type} canReact={v.canReact} />
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
