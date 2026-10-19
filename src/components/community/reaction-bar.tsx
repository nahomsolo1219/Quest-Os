"use client";

import { useState, useTransition } from "react";
import { Dumbbell, Flame, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { reactAction } from "@/app/app/community/actions";
import { S } from "@/app/app/community/strings";
import type { Reaction } from "@/domain/types";

const ICONS = { like: ThumbsUp, fire: Flame, strong: Dumbbell } as const;
const ORDER: Reaction[] = ["like", "fire", "strong"];

/** Three reaction buttons with counts; one reaction per member (tap again to remove, tap another to change). */
export function ReactionBar({ postId, reactions, mine, disabled }: {
  postId: string; reactions: Record<Reaction, number>; mine: Reaction | null; disabled?: boolean;
}) {
  const [state, setState] = useState({ reactions, mine });
  const [pending, start] = useTransition();

  function tap(type: Reaction) {
    const next = state.mine === type ? null : type;
    const prev = state;
    const counts = { ...state.reactions };
    if (state.mine) counts[state.mine] = Math.max(0, counts[state.mine] - 1);
    if (next) counts[next] += 1;
    setState({ reactions: counts, mine: next });
    start(async () => {
      const r = await reactAction({ postId, type: next });
      if (!r.ok) {
        setState(prev);
        toast.error(r.error);
      } else setState({ reactions: r.data.reactions, mine: r.data.myReaction });
    });
  }

  return (
    <div className="flex gap-2" role="group" aria-label="Reactions">
      {ORDER.map((t) => {
        const Icon = ICONS[t];
        const on = state.mine === t;
        return (
          <button key={t} type="button" disabled={disabled || pending} onClick={() => tap(t)} aria-pressed={on}
            aria-label={`${S.reactions[t]} (${state.reactions[t]})`}
            className={cn("flex min-h-11 min-w-14 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors disabled:opacity-60",
              on ? "border-primary bg-primary/10 text-primary" : "hover:bg-accent")}>
            <Icon className="size-4" aria-hidden />
            <span>{state.reactions[t]}</span>
          </button>
        );
      })}
    </div>
  );
}
