import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the role builder writes the real steps (data-tour targets on the pages).
export const deliveryTour: TourDef = {
  id: "delivery",
  steps: [
    welcomeStep("rider", "This tour shows your route, how to mark drops and how to hand over pick-ups."),
    weekStep,
    yourWeekStep([
      { label: "Every morning: open My drops", href: "/delivery" },
    ]),
  ],
};
