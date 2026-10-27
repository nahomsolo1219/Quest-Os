import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Owner tour (docs/STAFF_TOUR.md): Dashboard → Today → Clients → Payments → Weekly orders → Settings → Partners →
// Community moderation → Change log → Your week. Targets are data-tour attributes on the staff pages.
export const ownerTour: TourDef = {
  id: "owner",
  steps: [
    welcomeStep("owner", "Dagi, Kidus and Fahim run the business here: money, clients, prices and the team. This tour opens each screen you use and shows what to look at."),
    weekStep,

    // Dashboard
    {
      id: "dashboard-kpis",
      path: "/staff/dashboard",
      target: "dashboard-kpis",
      title: "Dashboard: your clients",
      body: "Active clients, new and churned this month, and MRR (the money active plans bring in each month). Start every morning here.",
    },
    {
      id: "dashboard-money",
      target: "dashboard-money",
      title: "Money this month",
      body: "Collected against invoiced, food cost % (purchases ÷ collected) and the margin estimate. Food cost turns red above 45%.",
    },
    {
      id: "dashboard-jobs",
      target: "dashboard-jobs",
      title: "Scheduled jobs",
      body: "The weekly jobs from the timeline run on their own. Each shows its last run; a red Overdue means a job missed its time, so tell whoever looks after Railway.",
    },

    // Today
    {
      id: "today-todo",
      path: "/staff",
      target: "today-todo",
      title: "Today: the to-do list",
      body: "Everything waiting today: payments to confirm, swaps to approve, clients unpaid for next week, leads to call. Each line has a button that opens the right screen; rows disappear when they reach zero.",
    },
    {
      id: "today-cutoff",
      target: "today-cutoff",
      title: "The next cutoff",
      body: "How long until next week's orders lock (Thursday 18:00). Unpaid clients at that moment are not cooked, so receipts must be confirmed before then.",
    },

    // Clients
    {
      id: "clients-search",
      path: "/staff/clients",
      target: "clients-search",
      title: "Find a client",
      body: "Type a name or phone number, or filter by status, plan, area or payment. Add lead adds someone who has not signed up yet.",
    },
    {
      id: "clients-open",
      target: "clients-first-row",
      title: "Open a client",
      body: "Tap a name to open everything about that client. Next, we open this one.",
    },
    {
      id: "client-tabs",
      path: { hrefOf: "clients-first-row" },
      target: "client-tabs",
      title: "One page per client",
      body: "Profile, nutrition, plan, swaps, payments, orders, check-ins and notes each have a tab. Tap a tab to switch.",
    },
    {
      id: "client-plan",
      target: "client-plan",
      title: "The Plan tab",
      body: "Shows the package, price per day, dates and price lock. Owners can also give a monthly discount here, with a reason; it shows on the Audit trail tab.",
    },
    {
      id: "client-notes",
      target: "client-notes",
      title: "The Notes tab",
      body: "Write anything the team should know about this client. Everyone with access to the client sees the notes.",
    },

    // Payments
    {
      id: "payment-confirm",
      path: "/staff/payments",
      target: "payment-confirm",
      title: "Payments: confirm a receipt",
      body: "Receipts clients sent wait here, oldest first. Check the amount and reference against the bank or telebirr, then Confirm (the client is told) or Reject with a reason they will read.",
    },

    // Weekly orders
    {
      id: "orders-week",
      path: "/staff/orders",
      target: "orders-week",
      title: "Weekly orders",
      body: "Who is cooked next week, who is skipped for non-payment and who is paused. Use the arrows to look at other weeks.",
    },
    {
      id: "orders-lock",
      target: "orders-lock-now",
      title: "Cutoff and lock",
      body: "Before the cutoff this is a preview. At Thursday 18:00 the week locks on its own and invoices go out. If the lock job ever fails, operations press Lock now here.",
    },

    // Settings
    {
      id: "settings-tabs",
      path: "/staff/settings/packages",
      target: "settings-tabs",
      title: "Settings",
      body: "Prices, packages, areas, the swap table, ingredients and the schedule. Only owners change prices and packages; every save is logged.",
    },
    {
      id: "settings-packages",
      target: "settings-packages",
      title: "Packages",
      body: "Each package card below sets the swap limit, check-in interval, delivery options and service fee. Untick Offered to new clients to stop selling one.",
    },
    {
      id: "settings-pricing",
      path: "/staff/settings/pricing",
      target: "settings-pricing",
      title: "Pricing",
      body: "The inputs of the price formula: buffers, monthly costs and the margin floor. New prices apply at each client's next renewal.",
    },
    {
      id: "settings-ingredients",
      path: "/staff/settings/ingredients",
      target: "settings-ingredients",
      title: "Ingredients and prices",
      body: "The box shows how many ingredients still have no price. A client price cannot be published while an ingredient on their menu has none.",
    },
    {
      id: "settings-areas",
      path: "/staff/settings/areas",
      target: "settings-areas",
      title: "Delivery areas",
      body: "The areas clients can choose, in route order. Deactivate an area to hide it from sign-up; Rename fixes a spelling.",
    },
    {
      id: "settings-swaps",
      path: "/staff/settings/swaps",
      target: "settings-swaps",
      title: "Swap table",
      body: "Which ingredients or meals clients may swap, how much they get and whether it costs extra. Untick Active to hide a swap.",
    },
    {
      id: "settings-schedule",
      path: "/staff/settings/schedule",
      target: "settings-schedule",
      title: "Schedule",
      body: "Service days, the cutoff and quick-start capacity. Changes apply from the next lock.",
    },

    // Partners
    {
      id: "partners",
      path: "/staff/partners",
      target: "partners-totals",
      title: "Partners",
      body: "What each partner put in: cash, time and equipment. Log a contribution below; this is a record, not an equity split.",
    },

    // Community moderation
    {
      id: "community-reports",
      path: "/staff/community?tab=reports",
      target: "community-reports",
      title: "Community reports",
      body: "Posts or comments members reported. Read it, then Hide it (with a reason) or Dismiss the report. Hidden and Members let you bring posts back or mute someone.",
    },

    // Audit log
    {
      id: "settings-changes",
      path: "/staff/settings/changes",
      target: "settings-changes",
      title: "Change log",
      body: "Who changed settings, prices, packages, swap rules, areas and nutrition targets, and when. A single client's history (discounts, payments) is on the Audit trail tab of their page.",
    },

    yourWeekStep([
      { label: "Every morning: check the Dashboard", href: "/staff/dashboard" },
      { label: "Every day: the Today to-do list", href: "/staff" },
      { label: "Before Thursday 18:00: confirm receipts", href: "/staff/payments" },
      { label: "Friday: look at the locked week", href: "/staff/orders" },
      { label: "When something looks off: the change log", href: "/staff/settings/changes" },
    ]),
  ],
};
