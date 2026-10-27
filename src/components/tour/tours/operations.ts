import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

/**
 * Operations (Nebiyou): Today → new lead → onboarding → payments → quick starts → weekly orders →
 * purchasing → delivery board → pick-up list → notifications. Targets: data-tour attributes on the
 * real pages (see docs/STAFF_TOUR.md and DECISIONS D620–D629).
 */
export const operationsTour: TourDef = {
  id: "operations",
  steps: [
    welcomeStep("operations", "Operations keeps clients, payments, orders, purchasing and delivery moving."),
    weekStep,
    {
      id: "today-todo",
      path: "/staff",
      target: "today-todo",
      title: "Start every day here",
      body: "Today lists what is waiting for you, with a count and a button for each: payments to confirm, quick starts, drops still out, leads to call. Work down the list until it says All clear.",
    },
    {
      id: "new-lead",
      path: "/staff/clients/new",
      target: "newclient-form",
      title: "Add a new lead",
      body: "When someone calls or messages about a plan, add them here: start with their name, then phone and where they heard about Quest Meals. You can onboard them right after.",
    },
    {
      id: "lead-on-today",
      path: "/staff",
      target: "today-lead",
      title: "Leads waiting for you",
      body: "Leads show under Clients needing attention with \"Lead: book a consult and onboard\". Tap the name to open the client.",
    },
    {
      id: "client-onboard",
      path: { hrefOf: "today-lead" },
      target: "client-onboard",
      title: "Onboard the client",
      body: "This is the client page. After the consult, press Onboard to set up their plan step by step.",
    },
    {
      id: "onboard-steps",
      path: { hrefOf: "client-onboard" },
      target: "onboard-steps",
      title: "Five onboarding steps",
      body: "Intake (body stats, allergies, address), Nutrition (calorie target and size), Plan, Swaps and Invoice. Tap a step to jump to it; each step saves before moving on.",
    },
    {
      id: "payments-queue",
      path: "/staff/payments",
      target: "payments-queue",
      title: "Payments to confirm",
      body: "Clients upload their Telebirr or CBE receipts here, oldest first. Unpaid weeks are not cooked, so clear this list before the Thursday 18:00 cutoff.",
    },
    {
      id: "payment-confirm",
      path: "/staff/payments",
      target: "payment-confirm",
      title: "Confirm or reject a receipt",
      body: "Check the amount and reference against the receipt photo, then press Confirm. If it does not match, press Reject and say why; the client is told either way.",
    },
    {
      id: "quick-starts",
      path: "/staff/quick-starts",
      target: "quickstarts-list",
      title: "Quick starts",
      body: "Each card is a new client starting on the next service day, with where their payment stands. Once it is confirmed by 18:00 they are added to tomorrow's production sheet. The daily maximum is at the top.",
    },
    {
      id: "orders-week",
      path: "/staff/orders",
      target: "orders-week",
      title: "Weekly orders",
      body: "Who is cooked next week, who is skipped for non-payment and who is paused. Use Previous week and Next week to move between weeks.",
    },
    {
      id: "orders-lock-now",
      path: "/staff/orders",
      target: "orders-lock-now",
      title: "Lock the week",
      body: "This box says whether the week is locked. Orders lock on their own at the Thursday 18:00 cutoff and unpaid clients are skipped. If the cutoff passed and the week is not locked, press Lock now.",
    },
    {
      id: "purchasing-tabs",
      path: "/staff/purchasing",
      target: "purchasing-tabs",
      title: "Purchasing",
      body: "Four tabs: the Shopping list for the week, the Top-up list for fresh items each morning, Log purchase and Price history.",
    },
    {
      id: "purchasing-shopping",
      path: "/staff/purchasing",
      target: "purchasing-shopping",
      title: "The shopping list",
      body: "Each week's list is built from the locked orders minus stock on hand and is ready on Friday morning. Buy what the Buy column says; Print gives you a copy for the market.",
    },
    {
      id: "purchasing-record",
      path: "/staff/purchasing?tab=log",
      target: "purchasing-record",
      title: "Record a purchase",
      body: "After shopping, log each item with the quantity and the total you paid. The app works out the new unit cost and keeps stock up to date.",
    },
    {
      id: "route-board",
      path: (c) => `/staff/delivery?date=${c.today}`,
      target: "route-board",
      title: "Delivery board",
      body: "Today's drops grouped by area in route order. Drag, or use the arrows, to change the order.",
    },
    {
      id: "route-assign",
      path: (c) => `/staff/delivery?date=${c.today}`,
      target: "route-assign",
      title: "Assign riders",
      body: "Pick a rider for a whole area or for one drop. Riders see their drops on My drops in this order.",
    },
    {
      id: "route-failed",
      path: (c) => `/staff/delivery?date=${c.today}`,
      target: "route-failed",
      title: "Failed drops",
      body: "Drops a rider could not deliver are counted here with the reason. Call the client and arrange a pick-up or a second try.",
    },
    {
      id: "pickup-list",
      path: "/delivery/pickup",
      target: "pickup-list",
      title: "Pick-up list",
      body: "Clients who collect at the cafe today. Tap Hand over when someone picks up their bag.",
    },
    {
      id: "notifications",
      path: "/staff/notifications",
      target: "notifications-list",
      title: "Notifications",
      body: "New receipts, failed drops and other alerts land here, newest first. Press Open to go straight to the thing that needs you.",
    },
    yourWeekStep([
      { label: "Every morning: work through the Today to-do list", href: "/staff" },
      { label: "Every day: confirm receipts in Payments", href: "/staff/payments" },
      { label: "Every day: assign riders on the Delivery board", href: (c) => `/staff/delivery?date=${c.today}` },
      { label: "Thursday 18:00: check Weekly orders locked", href: "/staff/orders" },
      { label: "Friday: buy from the Shopping list and log purchases", href: "/staff/purchasing" },
    ]),
  ],
};
