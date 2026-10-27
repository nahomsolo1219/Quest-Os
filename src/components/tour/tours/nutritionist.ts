import { welcomeStep, weekStep, yourWeekStep } from "../common";
import type { TourDef } from "../types";

// Placeholder: the role builder writes the real steps (data-tour targets on the pages).
export const nutritionistTour: TourDef = {
  id: "nutritionist",
  steps: [
    welcomeStep("nutritionist", "The nutritionist sets each client's calories and portions and answers swaps and check-ins."),
    weekStep,
    yourWeekStep([
      { label: "Every day: the Nutrition home", href: "/staff/nutrition" },
    ]),
  ],
};
