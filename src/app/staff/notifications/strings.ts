export const S = {
  title: "Notifications",
  description: (n: number) => (n ? `${n} unread` : "All caught up"),
  markAll: "Mark all as read",
  markRead: "Mark read",
  marked: "Marked as read.",
  allMarked: "All notifications marked as read.",
  open: "Open",
  emptyTitle: "No notifications yet",
  emptyBody: "Receipts to confirm, lock summaries and quick-start counts appear here. Link Telegram in your profile to get them on your phone too.",
  unread: "Unread",
} as const;
