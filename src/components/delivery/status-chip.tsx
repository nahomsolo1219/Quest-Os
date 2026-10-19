import { cn } from "@/lib/utils";
import type { DropStatus } from "@/domain/types";

const STYLE: Record<DropStatus, string> = {
  pending: "bg-muted text-foreground",
  delivered: "bg-emerald-100 text-emerald-800",
  failed: "bg-red-100 text-red-800",
};
const TEXT: Record<DropStatus, string> = { pending: "Pending", delivered: "Delivered", failed: "Failed" };

export function StatusChip({ status, pickup }: { status: DropStatus; pickup?: boolean }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STYLE[status])}>
      {pickup && status === "delivered" ? "Handed over" : TEXT[status]}
    </span>
  );
}
