import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CheckCircle2, EyeOff } from "lucide-react";
import { EmptyState } from "@/components/shell/empty-state";
import { AccessBanner } from "@/components/community/access-banner";
import { AnswerButton, PinButton } from "@/components/community/coach-buttons";
import { CommentForm } from "@/components/community/comment-form";
import { NoAccess } from "@/components/community/no-access";
import { PersonLine } from "@/components/community/person";
import { PostCard } from "@/components/community/post-card";
import { ReportButton } from "@/components/community/report-button";
import { cn } from "@/lib/utils";
import { ForbiddenError } from "@/server/authz";
import { ServiceError } from "@/server/services/context";
import { postDetail } from "@/server/services/community";
import { requirePageActor, serviceCtx } from "@/server/session";
import { formatAddisDateTime } from "@/domain/time";
import { S } from "../strings";

export const dynamic = "force-dynamic";

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const actor = await requirePageActor("client", "coach", "owner", "operations");
  const { postId } = await params;
  let data;
  try {
    data = await postDetail(await serviceCtx(actor), postId);
  } catch (e) {
    if (e instanceof ForbiddenError) return <NoAccess message={e.message} />;
    if (e instanceof ServiceError && e.code === "not_found") notFound();
    throw e;
  }
  const { post, comments, viewer: v } = data;
  const canAnswer = v.coach && post.type === "question";

  return (
    <div className="space-y-4">
      <Link href="/app/community" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />{S.back}
      </Link>
      <h1 className="sr-only">{`Post by ${post.author.name}`}</h1>
      <AccessBanner viewer={v} mutedLabel={v.mutedUntil ? formatAddisDateTime(new Date(v.mutedUntil)) : null} />
      <PostCard post={post} canReact={v.canReact} full />
      <div className="flex flex-wrap justify-end gap-2">
        {v.coach ? <PinButton postId={post.id} pinned={post.pinned} /> : null}
        {!post.mine ? <ReportButton targetType="post" targetId={post.id} /> : null}
      </div>

      <section aria-labelledby="comments-h" className="space-y-3">
        <h2 id="comments-h" className="text-lg font-bold">{S.commentsTitle}</h2>
        {comments.length === 0 ? (
          <EmptyState title={S.noComments}>{v.canPost ? S.noCommentsBody : null}</EmptyState>
        ) : (
          <ul className="space-y-3">
            {comments.map((c) => (
              <li key={c.id} className={cn("rounded-xl border p-3", c.isAnswer && "border-success/60 bg-success-soft", c.hidden && "border-dashed opacity-60")}>
                <div className="flex items-start justify-between gap-2">
                  <PersonLine person={c.author} when={c.when} />
                  {c.isAnswer ? <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-success"><CheckCircle2 className="size-4" aria-hidden />{S.answer}</span> : null}
                </div>
                {c.hidden ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><EyeOff className="size-3.5" aria-hidden />{S.hiddenBy}{c.hidden.reason ? `: ${c.hidden.reason}` : ""}</p>
                ) : null}
                <p className="mt-2 whitespace-pre-wrap break-words">{c.body}</p>
                <div className="mt-1 flex flex-wrap justify-end gap-1">
                  {canAnswer && !c.hidden ? <AnswerButton postId={post.id} commentId={c.id} isAnswer={c.isAnswer} /> : null}
                  {!c.mine ? <ReportButton targetType="comment" targetId={c.id} compact /> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        {v.canPost ? <CommentForm postId={post.id} /> : null}
      </section>
    </div>
  );
}
