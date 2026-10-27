import type { TodayTaskKey } from "@/server/services/ops";

// Strings for the staff "Today" screen.
export const S = {
  title: "Today",
  todoTitle: "To do",
  todoHint: "Only what you can act on. Rows disappear when they reach zero.",
  tasks: {
    receipts: { label: "Payments to confirm", action: "Confirm" },
    swaps: { label: "Swaps to approve", action: "Review" },
    sizes: { label: "Sizes to confirm", action: "Confirm" },
    quickStarts: { label: "Quick starts not yet added", action: "Open" },
    checkins: { label: "Check-ins due", action: "Log" },
    drops: { label: "Drops still out today", action: "Track" },
    overdue: { label: "Overdue invoices", action: "Follow up" },
    unpaidNext: { label: "Unpaid for next week", action: "Review" },
    leads: { label: "Leads to call", action: "Call" },
  } satisfies Record<TodayTaskKey, { label: string; action: string }>,
  allClear: "All clear",
  allClearBody: "Nothing waiting for you right now.",
  cutoffTitle: (week: string) => `Cutoff for the week of ${week}`,
  cutoffVerb: "Orders lock",
  cutoffAt: (t: string) => `Orders, swaps, pauses and address changes lock ${t}.`,
  lockMissing: (week: string) => `The week of ${week} passed its cutoff but is not locked yet.`,
  lockedOk: (week: string) => `Week of ${week} is locked.`,
  openOrders: "Open weekly orders",
  previewNext: "Preview next week",
  attentionTitle: "Clients needing attention",
  attentionEmpty: "Nobody needs attention right now. New leads, overdue invoices and provisional sizes show up here.",
  passed: "passed",
} as const;
