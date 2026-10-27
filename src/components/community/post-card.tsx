import Link from "next/link";
import { CheckCircle2, EyeOff, MessageCircle, Pin, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { FeedPost } from "@/server/services/community";
import { S } from "@/app/app/community/strings";
import { PersonLine } from "./person";
import { ReactionBar } from "./reaction-bar";

/** One post: author, type, text, photos (grid up to 4), progress, reactions and comment count. */
export function PostCard({ post, canReact, full = false }: { post: FeedPost; canReact: boolean; full?: boolean }) {
  const body = full || post.body.length <= 400 ? post.body : `${post.body.slice(0, 400)}…`;
  const down = post.progressText?.startsWith("−");
  return (
    <article data-tour={full ? undefined : "community-post"} className={cn("rounded-2xl border bg-card p-4 shadow-xs", post.hidden && "border-dashed opacity-60", post.pinned && "border-primary/40")}>
      {post.pinned && full ? (
        <p className="mb-2 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Pin className="size-3.5" aria-hidden />{S.pinned}</p>
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <PersonLine person={post.author} when={post.when} />
        {post.type !== "post" ? <Badge variant="secondary" className="shrink-0">{post.type === "question" ? "Q&A" : S.types[post.type]}</Badge> : null}
      </div>
      {post.hidden ? (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
          <EyeOff className="size-3.5" aria-hidden />{S.hiddenBy}{post.hidden.reason ? `: ${post.hidden.reason}` : ""}
        </p>
      ) : null}
      {post.progressText ? (
        <p className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 font-bold text-primary">
          {down ? <TrendingDown className="size-4" aria-hidden /> : <TrendingUp className="size-4" aria-hidden />}
          <span className="stat-number">{post.progressText}</span>
        </p>
      ) : null}
      {full ? <p className="mt-3 whitespace-pre-wrap break-words">{body}</p> : (
        <Link href={`/app/community/${post.id}`} className="mt-3 block whitespace-pre-wrap break-words hover:underline-offset-2">{body}</Link>
      )}
      {post.photos.length > 0 ? (
        <div className={cn("mt-3 grid gap-1.5 overflow-hidden rounded-lg", post.photos.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {post.photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt={S.photoAlt(i + 1, post.author.name)} width={800} height={post.photos.length === 1 ? 600 : 800}
              loading="lazy" decoding="async"
              className={cn("h-auto w-full bg-muted object-cover", post.photos.length === 1 ? "aspect-[4/3]" : "aspect-square", post.photos.length === 3 && i === 0 && "col-span-2 aspect-[2/1]")} />
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <ReactionBar postId={post.id} reactions={post.reactions} mine={post.myReaction} disabled={!canReact} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {post.type === "question" ? (
            post.answered
              ? <span className="inline-flex items-center gap-1 font-medium text-success"><CheckCircle2 className="size-4" aria-hidden />{S.answered}</span>
              : <span>{S.unanswered}</span>
          ) : null}
          {full ? <span className="inline-flex items-center gap-1"><MessageCircle className="size-4" aria-hidden />{S.comments(post.commentCount)}</span> : (
            <Link href={`/app/community/${post.id}`} className="inline-flex min-h-11 items-center gap-1 font-medium hover:text-foreground">
              <MessageCircle className="size-4" aria-hidden />{S.comments(post.commentCount)}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
