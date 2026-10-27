"use client";

import { useEffect, useState } from "react";
import { Compass } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOUR_META, type TourId, type TourProgressMap } from "@/lib/tours";
import { TOURS } from "./tours";
import { RUN_KEY, startTour, TOUR_STATE_EVENT } from "./events";

/**
 * "Take the tour" in the staff user menu (sidebar footer on laptops, menu sheet on phones).
 * Lists every tour the person's roles allow; shows "3 of 9" while one runs.
 */
export function TourMenu({ tours, progress, tone = "light", onPick }: {
  tours: TourId[]; progress: TourProgressMap; tone?: "light" | "dark"; onPick?: () => void;
}) {
  const [running, setRunning] = useState<{ tourId: TourId; step: number } | null>(null);
  useEffect(() => {
    try { const v = sessionStorage.getItem(RUN_KEY); if (v) setRunning(JSON.parse(v)); } catch { /* ignore */ }
    const on = (e: Event) => setRunning((e as CustomEvent).detail ?? null);
    window.addEventListener(TOUR_STATE_EVENT, on);
    return () => window.removeEventListener(TOUR_STATE_EVENT, on);
  }, []);
  if (tours.length === 0) return null;
  const dark = tone === "dark";
  const label = (id: TourId) => TOUR_META.find((t) => t.id === id)?.label ?? "Tour";
  return (
    <div className="space-y-1" data-tour="menu-tours">
      {tours.map((id) => {
        const isRunning = running?.tourId === id;
        const p = progress[id];
        const total = TOURS[id].steps.length;
        return (
          <button key={id} type="button" data-tour={`take-tour-${id}`}
            onClick={() => { onPick?.(); startTour(id, 0); }}
            className={cn("flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm font-medium",
              dark ? "text-sidebar-foreground hover:bg-sidebar-accent" : "hover:bg-accent")}>
            <Compass aria-hidden className={cn("size-4 shrink-0", dark ? "text-lime" : "text-primary")} />
            <span className="flex-1">{tours.length === 1 ? "Take the tour" : `Take the ${label(id).toLowerCase()}`}</span>
            {isRunning ? (
              <span className={cn("rounded-full px-2 text-xs font-semibold tabular", dark ? "bg-lime text-forest" : "bg-primary text-primary-foreground")}>
                {running!.step + 1} of {total}
              </span>
            ) : p?.status === "completed" ? (
              <span className={cn("text-xs", dark ? "text-sidebar-muted" : "text-muted-foreground")}>Done</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
