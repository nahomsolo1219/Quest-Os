// Strings for the staff "Today" screen.
export const S = {
  title: "Today",
  receipts: "Receipts to confirm",
  quickStarts: "Quick starts waiting for payment",
  provisional: "Sizes to confirm",
  leads: "Leads",
  overdue: "Overdue invoices",
  unpaidNext: "Unpaid for next week",
  cutoffTitle: (week: string) => `Cutoff for the week of ${week}`,
  cutoffAt: (t: string) => `Orders, swaps, pauses and address changes lock ${t}.`,
  lockMissing: (week: string) => `The week of ${week} passed its cutoff but is not locked yet.`,
  lockedOk: (week: string) => `Week of ${week} is locked.`,
  openOrders: "Open weekly orders",
  previewNext: "Preview next week",
  attentionTitle: "Clients needing attention",
  attentionEmpty: "Nobody needs attention right now. New leads, overdue invoices and provisional sizes show up here.",
  passed: "passed",
} as const;
