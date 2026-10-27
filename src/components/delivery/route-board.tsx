"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { assignRiderAction, reorderDropsAction } from "@/app/staff/delivery/actions";
import { cn } from "@/lib/utils";
import { StatusChip } from "./status-chip";
import { SLOT_TEXT, type DropCardData } from "./types";

type Group = { areaId: string | null; areaName: string; drops: DropCardData[] };

/**
 * Ops drop list by area: reorder with up / down buttons (keyboard and touch friendly) or HTML5 drag and drop
 * within an area, and assign a rider per drop or per area.
 */
export function RouteBoard({ date, groups: initial, riders, canManage }: {
  date: string; groups: Group[]; riders: { id: string; name: string }[]; canManage: boolean;
}) {
  const [groups, setGroups] = useState(initial);
  const [dragging, setDragging] = useState<{ area: number; index: number } | null>(null);
  const [pending, start] = useTransition();

  const saveOrder = (gi: number, drops: DropCardData[]) => {
    const before = groups;
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, drops } : g)));
    start(async () => {
      const r = await reorderDropsAction({ date, orderedIds: drops.map((d) => d.id) });
      if (r.ok) toast.success(r.message ?? "Route order saved");
      else { setGroups(before); toast.error(r.error); }
    });
  };
  const move = (gi: number, from: number, to: number) => {
    const list = [...groups[gi].drops];
    if (to < 0 || to >= list.length || from === to) return;
    const [m] = list.splice(from, 1);
    list.splice(to, 0, m);
    saveOrder(gi, list);
  };
  const assign = (dropIds: string[], riderUserId: string | null) => start(async () => {
    const r = await assignRiderAction({ dropIds, riderUserId });
    if (r.ok) {
      const name = riders.find((x) => x.id === riderUserId)?.name ?? null;
      setGroups((gs) => gs.map((g) => ({ ...g, drops: g.drops.map((d) => (dropIds.includes(d.id) ? { ...d, riderUserId, riderName: name } : d)) })));
      toast.success(riderUserId ? `Assigned to ${name}` : "Rider removed");
    } else toast.error(r.error);
  });

  const offsets = groups.map((_, gi) => groups.slice(0, gi).reduce((n, g) => n + g.drops.length, 0));
  return (
    <div className="space-y-6">
      {groups.map((g, gi) => (
        <section key={g.areaId ?? "none"} aria-labelledby={`area-${gi}`}>
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <h2 id={`area-${gi}`} className="text-lg font-bold">{g.areaName} <span className="text-sm font-normal text-muted-foreground">· {g.drops.length} {g.drops.length === 1 ? "drop" : "drops"}</span></h2>
            {canManage && riders.length ? (
              <div className="flex w-full items-center gap-2 sm:w-auto">
                <label htmlFor={`area-rider-${gi}`} className="shrink-0 text-sm">Assign area to</label>
                <select id={`area-rider-${gi}`} className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:w-44 sm:flex-none" disabled={pending} value=""
                  onChange={(e) => { if (e.target.value) assign(g.drops.map((d) => d.id), e.target.value === "none" ? null : e.target.value); }}>
                  <option value="">Choose rider</option>
                  {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  <option value="none">No rider</option>
                </select>
              </div>
            ) : null}
          </div>
          <ol className="divide-y rounded-xl border bg-card">
            {g.drops.map((d, i) => (
              <li key={d.id}
                draggable={canManage}
                onDragStart={(e) => { setDragging({ area: gi, index: i }); e.dataTransfer.effectAllowed = "move"; }}
                onDragOver={(e) => { if (dragging?.area === gi) e.preventDefault(); }}
                onDrop={(e) => { e.preventDefault(); if (dragging?.area === gi) move(gi, dragging.index, i); setDragging(null); }}
                onDragEnd={() => setDragging(null)}
                className={cn("flex flex-wrap items-center gap-2 p-3", dragging?.area === gi && dragging.index === i && "opacity-50")}>
                {canManage ? <GripVertical aria-hidden className="hidden size-5 shrink-0 cursor-grab text-muted-foreground sm:block" /> : null}
                <span className="stat-number w-7 shrink-0 text-center text-lg" title="Route position">{offsets[gi] + i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">{d.name} <StatusChip status={d.status} /></p>
                  <p className="line-clamp-2 text-sm text-muted-foreground sm:truncate" title={d.address ?? undefined}>{d.address ?? "No address"}</p>
                  <p className="text-sm text-muted-foreground">{d.mealsCount} meals{d.slot ? ` · ${SLOT_TEXT[d.slot] ?? d.slot}` : ""}</p>
                  {d.status === "failed" && d.failedReason ? <p className="text-sm font-semibold text-danger">Failed: {d.failedReason}</p> : null}
                </div>
                {canManage ? (
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <label htmlFor={`rider-${d.id}`} className="sr-only">Rider for {d.name}</label>
                    <select id={`rider-${d.id}`} className="h-11 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm sm:w-40 sm:flex-none" disabled={pending}
                      value={d.riderUserId ?? ""} onChange={(e) => assign([d.id], e.target.value || null)}>
                      <option value="">No rider</option>
                      {riders.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <Button type="button" variant="outline" size="icon" className="size-11" disabled={pending || i === 0}
                      aria-label={`Move ${d.name} up`} onClick={() => move(gi, i, i - 1)}><ArrowUp /></Button>
                    <Button type="button" variant="outline" size="icon" className="size-11" disabled={pending || i === g.drops.length - 1}
                      aria-label={`Move ${d.name} down`} onClick={() => move(gi, i, i + 1)}><ArrowDown /></Button>
                  </div>
                ) : <span className="text-sm text-muted-foreground">{d.riderName ?? "No rider"}</span>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
