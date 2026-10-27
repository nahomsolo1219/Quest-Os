import { cn } from "@/lib/utils";

/**
 * One status badge for the whole app. Colour always comes with a word, never alone.
 * good: paid / done / delivered · warn: pending / due soon · bad: late / failed / rejected
 * paused: paused / skipped / ended · info: neutral facts (lead, new).
 * Pairs are AA-checked in src/lib/brand.test.ts.
 */
export type StatusTone = "good" | "warn" | "bad" | "paused" | "info";

const TONE_CLASS: Record<StatusTone, string> = {
  good: "border-success/25 bg-success-soft text-success",
  warn: "border-warning/25 bg-warning-soft text-warning",
  bad: "border-danger/25 bg-danger-soft text-danger",
  paused: "border-paused/20 bg-paused-soft text-paused",
  info: "border-primary/15 bg-accent text-accent-foreground",
};

/** Text colour for a tone, for inline words (e.g. a number in a table). */
export const TONE_TEXT: Record<StatusTone, string> = {
  good: "text-success",
  warn: "text-warning",
  bad: "text-danger",
  paused: "text-paused",
  info: "text-primary",
};

/** Soft panel (box) for a tone, e.g. a banner or a highlighted row. */
export const TONE_PANEL: Record<StatusTone, string> = {
  good: "border-success/30 bg-success-soft text-success",
  warn: "border-warning/30 bg-warning-soft text-warning",
  bad: "border-danger/30 bg-danger-soft text-danger",
  paused: "border-paused/25 bg-paused-soft text-paused",
  info: "border-primary/15 bg-accent text-accent-foreground",
};

/** Common status words → tone, so callers can pass the raw status. */
const STATUS_TONE: Record<string, StatusTone> = {
  paid: "good", done: "good", delivered: "good", confirmed: "good", active: "good", locked: "good", approved: "good", ok: "good",
  pending: "warn", pending_payment: "warn", requested: "warn", due: "warn", issued: "warn", submitted: "warn", waiting: "warn", provisional: "warn",
  late: "bad", overdue: "bad", failed: "bad", rejected: "bad", skipped_unpaid: "bad", missing: "bad",
  paused: "paused", skipped: "paused", cancelled: "paused", ended: "paused", void: "paused", none: "paused",
  lead: "info", new: "info",
};

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? "paused";
}

export function StatusBadge({ tone, status, children, className }: {
  tone?: StatusTone; status?: string; children?: React.ReactNode; className?: string;
}) {
  const t = tone ?? statusTone(status ?? "");
  const text = children ?? (status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : null);
  return (
    <span
      data-slot="status-badge"
      data-tone={t}
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold",
        TONE_CLASS[t],
        className,
      )}
    >
      {text}
    </span>
  );
}
