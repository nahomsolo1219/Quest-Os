import { Info } from "lucide-react";
import type { PublicViewer } from "@/server/services/community";
import { S } from "@/app/app/community/strings";

/** Read-only banner for paused, ended or muted members. */
export function AccessBanner({ viewer, mutedLabel }: { viewer: PublicViewer; mutedLabel?: string | null }) {
  if (viewer.canPost) return null;
  const text = viewer.limit === "paused" ? S.banners.paused
    : viewer.limit === "ended" ? S.banners.ended
      : viewer.limit === "muted" ? S.banners.muted(mutedLabel ?? "later")
        : S.banners.read;
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning-soft p-3 text-sm text-warning">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{text}</p>
    </div>
  );
}
