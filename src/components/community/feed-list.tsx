"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FeedPost } from "@/server/services/community";
import type { PostType } from "@/domain/types";
import { loadMoreAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";
import { PostCard } from "./post-card";

/** The paginated part of the feed with a "Load more" button (cursor pagination, light on data). */
export function FeedList({ initial, cursor, type, canReact }: { initial: FeedPost[]; cursor: string | null; type: PostType | null; canReact: boolean }) {
  const [posts, setPosts] = useState(initial);
  const [next, setNext] = useState(cursor);
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {posts.map((p) => <PostCard key={p.id} post={p} canReact={canReact} />)}
      {next ? (
        <Button variant="outline" className="h-11 w-full" disabled={pending} onClick={() => start(async () => {
          const r = await loadMoreAction({ cursor: next, type });
          if (!r.ok) { toast.error(r.error); return; }
          setPosts((cur) => [...cur, ...r.data.posts.filter((p) => !cur.some((c) => c.id === p.id))]);
          setNext(r.data.nextCursor);
        })}>
          {pending ? S.loading : S.loadMore}
        </Button>
      ) : posts.length > 0 ? <p className="py-2 text-center text-sm text-muted-foreground">{S.noMore}</p> : null}
    </div>
  );
}
