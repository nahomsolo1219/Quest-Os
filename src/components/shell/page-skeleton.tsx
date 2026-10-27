import { Skeleton } from "@/components/ui/skeleton";

/** Loading placeholder shaped like a page: header, a row of tiles, then cards or list rows. */
export function PageSkeleton({ tiles = 3, rows = 4, label = "Loading" }: { tiles?: number; rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-4">
      <span className="sr-only">{label}…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {tiles > 0 ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {Array.from({ length: tiles }, (_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : null}
      <div className="space-y-3">
        {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
      </div>
    </div>
  );
}
