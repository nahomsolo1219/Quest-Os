import { cn } from "@/lib/utils";
import { StatusBadge, TONE_TEXT, type StatusTone } from "@/components/shell/status-badge";

/** Tone names used across staff screens; all render the one StatusBadge. */
export type Tone = "good" | "warn" | "bad" | "muted" | "info";
const TO_STATUS: Record<Tone, StatusTone> = { good: "good", warn: "warn", bad: "bad", muted: "paused", info: "info" };

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <StatusBadge tone={TO_STATUS[tone]} className={className}>{children}</StatusBadge>;
}

const CLIENT_STATUS: Record<string, [string, Tone]> = {
  lead: ["Lead", "info"], active: ["Active", "good"], paused: ["Paused", "warn"], ended: ["Ended", "muted"],
};
export function ClientStatusBadge({ status }: { status: string }) {
  const [label, tone] = CLIENT_STATUS[status] ?? [status, "muted"];
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}

const PAYMENT: Record<string, [string, Tone]> = {
  paid: ["Paid", "good"], due: ["Due", "warn"], overdue: ["Overdue", "bad"], none: ["No invoice", "muted"],
};
export function PaymentBadge({ state }: { state: string }) {
  const [label, tone] = PAYMENT[state] ?? [state, "muted"];
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}

const ORDER: Record<string, [string, Tone]> = {
  locked: ["Locked", "good"], skipped_unpaid: ["Skipped: not paid", "bad"], paused: ["Paused", "warn"],
};
export function OrderStatusBadge({ status }: { status: string }) {
  const [label, tone] = ORDER[status] ?? [status, "muted"];
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}

const INVOICE: Record<string, [string, Tone]> = { issued: ["Issued", "warn"], paid: ["Paid", "good"], void: ["Void", "muted"] };
export function InvoiceBadge({ status }: { status: string }) {
  const [label, tone] = INVOICE[status] ?? [status, "muted"];
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}

const PAYMENT_ROW: Record<string, [string, Tone]> = { submitted: ["Waiting", "warn"], confirmed: ["Confirmed", "good"], rejected: ["Rejected", "bad"] };
export function PaymentRowBadge({ status }: { status: string }) {
  const [label, tone] = PAYMENT_ROW[status] ?? [status, "muted"];
  return <ToneBadge tone={tone}>{label}</ToneBadge>;
}

/** Allergy / dislike conflicts in red (SPEC document 4, last paragraph). */
export function ConflictList({ conflicts, className }: { conflicts: string[]; className?: string }) {
  if (conflicts.length === 0) return null;
  return (
    <ul className={cn("space-y-0.5 text-sm font-medium", TONE_TEXT.bad, className)}>
      {conflicts.map((c) => <li key={c}>{c}</li>)}
    </ul>
  );
}
