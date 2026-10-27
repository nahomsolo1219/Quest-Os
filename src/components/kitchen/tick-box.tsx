"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const PREFIX = "qm-kitchen-tick:";

/**
 * A 44 px tick box for kitchen sheets ("done" / "packed"). Ticks are only a working aid on this device:
 * they are kept in localStorage per sheet, day and row so a refresh does not lose them, and are never sent
 * to the server. Hidden in print so printed sheets stay exactly as before.
 */
export function TickBox({ id, label, className }: { id: string; label: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const key = PREFIX + id;
  useEffect(() => {
    try {
      if (ref.current) ref.current.checked = window.localStorage.getItem(key) === "1";
    } catch { /* storage blocked: ticks just do not persist */ }
  }, [key]);
  return (
    <label className={cn("no-print inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md hover:bg-mist", className)}>
      <input ref={ref} type="checkbox" aria-label={label}
        className="size-6 cursor-pointer accent-primary"
        onChange={(e) => {
          try {
            if (e.target.checked) window.localStorage.setItem(key, "1"); else window.localStorage.removeItem(key);
          } catch { /* ignore */ }
        }} />
    </label>
  );
}
