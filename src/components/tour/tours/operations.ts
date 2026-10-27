import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the role builder writes the real steps (data-tour targets on the pages).
export const operationsTour: TourDef = {
  id: "operations",
  steps: [
    welcomeStep("operations", "Operations keeps clients, payments, orders, purchasing and delivery moving."),
    weekStep,
    yourWeekStep([
      { label: "Every morning: the Today to-do list", href: "/staff" },
      { label: "Confirm receipts in Payments", href: "/staff/payments" },
    ]),
  ],
};
