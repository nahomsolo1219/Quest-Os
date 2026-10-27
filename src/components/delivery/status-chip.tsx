import type { DropStatus } from "@/domain/types";
import { StatusBadge, type StatusTone } from "@/components/shell/status-badge";

const TONE: Record<DropStatus, StatusTone> = { pending: "warn", delivered: "good", failed: "bad" };
const TEXT: Record<DropStatus, string> = { pending: "Pending", delivered: "Delivered", failed: "Failed" };

export function StatusChip({ status, pickup }: { status: DropStatus; pickup?: boolean }) {
  return (
    <StatusBadge tone={TONE[status]} className="px-2.5 text-xs">
      {pickup && status === "delivered" ? "Handed over" : TEXT[status]}
    </StatusBadge>
  );
}
