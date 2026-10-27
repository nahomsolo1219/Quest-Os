import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

/**
 * Nutritionist tour: Nutrition home (intake queue) → a client's nutrition page (targets, consultation
 * notes) → profile table (portions per profile) → check-ins due → swap approvals → Settings › Nutrition.
 * The client page comes right after the home page because the tour follows a real link from "All clients".
 */
export const nutritionistTour: TourDef = {
  id: "nutritionist",
  steps: [
    welcomeStep("nutritionist", "This tour shows how to set each client's size and targets, keep portions on target and answer check-ins and swaps."),
    weekStep,
    {
      id: "menu-nutrition",
      path: "/staff/nutrition",
      target: "nav-nutrition",
      action: "open-nav",
      title: "Nutrition in the menu",
      body: "Everything you do lives under Nutrition. Its tabs are Intake queue, Profile table, Swap approvals and Check-ins.",
    },
    {
      id: "nutrition-counts",
      path: "/staff/nutrition",
      target: "nutrition-counts",
      title: "Your numbers at a glance",
      body: "Quick starts to confirm, clients without targets, flagged profile days and swap requests. Orange means something is waiting for you.",
    },
    {
      id: "nutrition-intake",
      path: "/staff/nutrition",
      target: "nutrition-intake",
      title: "Quick starts to confirm",
      body: "The calculator picks a size when a client signs up with a quick start. Open each one, check it and confirm or change it before the hours run out.",
    },
    {
      id: "nutrition-clients",
      path: "/staff/nutrition",
      target: "nutrition-client-link",
      title: "All clients",
      body: "Further down, All clients lists everyone with their size, goal and calories. Tap a name to open their nutrition page; next we open this one.",
    },
    {
      id: "client-targets",
      path: { hrefOf: "nutrition-client-link" },
      target: "client-nutrition-targets",
      title: "Size and targets",
      body: "Calculator is the size and macros suggested from the body stats; Set is what the kitchen cooks. To change it, use Set size and targets below and press Save targets. Changes start with the next week that has not locked.",
    },
    {
      id: "client-consultations",
      target: "client-nutrition-consultations",
      title: "Consultation notes",
      body: "After you talk with a client, log the consultation here: when, phone or in person, and what you agreed. Check-ins and weight history sit next to it.",
    },
    {
      id: "profiles-totals",
      path: "/staff/nutrition/profiles",
      target: "profiles-totals",
      title: "Profile table: day totals",
      body: "Each card is one portion profile's day total on this menu. Green says On target; an orange card misses its calorie or macro target, says why, and needs a look.",
    },
    {
      id: "profiles-portions",
      target: "profiles-portions",
      title: "Portion sizes per profile",
      body: "Each part of a meal has its grams (or pieces) for the six profiles. Tap a number to change it; your value stays manual. Press Recompute after menu changes.",
    },
    {
      id: "checkins-due",
      path: "/staff/nutrition/checkins",
      target: "checkins-due",
      title: "Check-ins due",
      body: "Active clients who have not checked in for 2 weeks. Call or message them, then log their weight and how well they kept to the plan.",
    },
    {
      id: "swaps",
      path: "/staff/nutrition/swaps",
      target: "swaps-first",
      title: "Swap approvals",
      body: "Clients ask for swaps outside the swap table or beyond their plan's limit. Check allergies, then Approve or Reject; the client is told either way.",
    },
    {
      id: "settings-nutrition",
      path: "/staff/settings/nutrition",
      target: "settings-nutrition",
      title: "Settings › Nutrition",
      body: "Below are the numbers behind the calculator: activity factors, size calories, macro split and portion limits. Every change needs a reason and goes in the change log; then press Recompute on the Profile table.",
    },
    yourWeekStep([
      { label: "Every day: confirm quick starts in the Intake queue", href: "/staff/nutrition" },
      { label: "Set targets for new clients", href: "/staff/nutrition" },
      { label: "Answer swap requests before Thursday's cutoff", href: "/staff/nutrition/swaps" },
      { label: "Weekly: call clients with check-ins due", href: "/staff/nutrition/checkins" },
      { label: "After menu changes: check the Profile table", href: "/staff/nutrition/profiles" },
    ]),
  ],
};
