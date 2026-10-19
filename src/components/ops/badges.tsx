import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warn: "border-amber-200 bg-amber-50 text-amber-900",
  bad: "border-red-200 bg-red-50 text-red-800",
  muted: "border-border bg-muted text-muted-foreground",
  info: "border-sky-200 bg-sky-50 text-sky-900",
} as const;
export type Tone = keyof typeof TONES;

export function ToneBadge({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return <Badge variant="outline" className={cn("whitespace-nowrap", TONES[tone], className)}>{children}</Badge>;
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
    <ul className={cn("space-y-0.5 text-sm font-medium text-red-700", className)}>
      {conflicts.map((c) => <li key={c}>{c}</li>)}
    </ul>
  );
}
